// AES-128 (jeden 16bajtový blok) pro šifrování zpráv chytrých kostek. Web Crypto AES-CBC
// vyžaduje zarovnání (padding), kostky ho nepoužívají – proto vlastní malá implementace
// podle FIPS-197 (S-box se spočte, klíč se rozšíří jednou).

const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
{
  // S-box: inverze v GF(2^8) + afinní transformace
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
}
const xt = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };

/** Rozšířený klíč (11 × 16 bajtů). */
function expand(key) {
  const w = new Uint8Array(176);
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t = w.slice(i - 4, i);
    if (i % 16 === 0) {
      t = Uint8Array.of(SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]);
      rcon = xt(rcon);
    }
    for (let k = 0; k < 4; k++) w[i + k] = w[i - 16 + k] ^ t[k];
  }
  return w;
}

function encryptBlock(w, s) {
  for (let i = 0; i < 16; i++) s[i] ^= w[i];
  for (let r = 1; r <= 10; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    // ShiftRows (sloupcové uspořádání: s[c*4 + r])
    const t = s.slice();
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) s[c * 4 + row] = t[((c + row) % 4) * 4 + row];
    if (r < 10) for (let c = 0; c < 4; c++) {
      const [a0, a1, a2, a3] = s.slice(c * 4, c * 4 + 4);
      s[c * 4] = xt(a0) ^ xt(a1) ^ a1 ^ a2 ^ a3;
      s[c * 4 + 1] = a0 ^ xt(a1) ^ xt(a2) ^ a2 ^ a3;
      s[c * 4 + 2] = a0 ^ a1 ^ xt(a2) ^ xt(a3) ^ a3;
      s[c * 4 + 3] = xt(a0) ^ a0 ^ a1 ^ a2 ^ xt(a3);
    }
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}

function decryptBlock(w, s) {
  for (let i = 0; i < 16; i++) s[i] ^= w[160 + i];
  for (let r = 9; r >= 0; r--) {
    const t = s.slice();
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) s[((c + row) % 4) * 4 + row] = t[c * 4 + row];
    for (let i = 0; i < 16; i++) s[i] = INV[s[i]];
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    if (r > 0) for (let c = 0; c < 4; c++) {
      const [a0, a1, a2, a3] = s.slice(c * 4, c * 4 + 4);
      s[c * 4] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
      s[c * 4 + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
      s[c * 4 + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
      s[c * 4 + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
    }
  }
  return s;
}

/** AES-128: { encrypt(block), decrypt(block) } pro 16bajtové bloky (ECB, bez paddingu). */
export function aes128(key) {
  const w = expand(Uint8Array.from(key));
  return {
    encrypt: (block) => encryptBlock(w, Uint8Array.from(block)),
    decrypt: (block) => decryptBlock(w, Uint8Array.from(block)),
  };
}

/** Jeden blok AES-128-CBC s danou IV (šifrování / dešifrování), jak ho používají kostky GAN. */
export function cbcBlock(key, iv) {
  const a = aes128(key);
  return {
    encrypt: (block) => a.encrypt(Uint8Array.from(block, (b, i) => b ^ iv[i])),
    decrypt: (block) => a.decrypt(block).map((b, i) => b ^ iv[i]),
  };
}
