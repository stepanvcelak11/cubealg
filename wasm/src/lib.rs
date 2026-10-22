// Jádro hledání (src/search/engine.js) ve WebAssembly: stejné prohledávání do hloubky
// (IDA* `search` i větve a meze podle ceny `searchCost`), stejné pořadí tahů, stejné
// počítání uzlů – výsledky jsou totožné s JS verzí, jen rychlejší.
//
// Hledání nemá rekurzi, ale vlastní zásobník, takže se dá kdykoli přerušit a navázat:
// běh vrátí řízení JS po každých 8192 uzlech (kontrola času), u každého řešení
// (zápis a rozhodnutí, zda pokračovat) a když chybí cena tahu ze stavu ruky
// (model ceny počítá JS líně, viz explore.js costModel).
//
// Paměť: JS si přes `alloc` vyhradí buffery, naplní je (přechody, databáze, tabulka
// blízko cíle…) a předá je úloze; úloha je vlastní a uvolní je `problem_free`.
// Build: npm run wasm (cargo build --target wasm32-unknown-unknown --release).

use std::alloc::{alloc as raw_alloc, dealloc, Layout};

const UNREACHABLE: u8 = 255;
const PACKED_UNREACHABLE: u8 = 15;
const CHECK: u32 = 8192;
const MAX_DEPTH: usize = 64;

// Návratové kódy běhu
const DONE: i32 = 0;
const BUDGET: i32 = 1;
const SOLUTION: i32 = 2;
const NEED_COST: i32 = 3;

// --- paměť pro JS ----------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    unsafe { raw_alloc(Layout::from_size_align(len.max(1), 8).unwrap()) }
}

#[no_mangle]
pub extern "C" fn free(ptr: *mut u8, len: usize) {
    unsafe { dealloc(ptr, Layout::from_size_align(len.max(1), 8).unwrap()) }
}

struct Buf {
    ptr: *mut u8,
    len: usize,
}

impl Buf {
    fn u8(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
    fn u16(&self) -> &[u16] {
        unsafe { std::slice::from_raw_parts(self.ptr as *const u16, self.len / 2) }
    }
}

// --- úloha -------------------------------------------------------------------------------

struct Table {
    ids: Vec<u32>,
    sizes: Vec<u32>,
    dist: usize, // index bufferu
    packed: bool,
}

struct Near {
    keys: usize,
    mask: u32,
    radius: u8,
    // vzdálenost (dolní bajt) a otisk klíče (horní bajt) vedle sebe: sondy čtou
    // souvislou paměť a klíč se porovná jen při shodě otisku
    slots: Vec<u16>,
}

#[inline(always)]
fn near_hash(v: *const u8, n: usize) -> u32 {
    let mut h: u32 = 2166136261;
    for i in 0..n {
        h = (h ^ unsafe { *v.add(i) } as u32).wrapping_mul(16777619);
    }
    h
}

struct Problem {
    n: usize,
    m: usize,
    targets: usize,
    size: Vec<u32>,
    trans: Vec<usize>, // index bufferu přechodů pro každý dílek
    tables: Vec<Table>,
    rest: Vec<u32>,
    oks: Vec<usize>, // buffer povolených hodnot [cíl * n + dílek]
    redundant: usize,
    near: Option<Near>,
    cost_tables: Vec<Table>,
    q: f64,
    bufs: Vec<Buf>,
    // zkompilovaná podoba pro rychlý přístup (problem_finish)
    c_trans: Vec<*const u8>,
    c_masks: Vec<u32>, // povolené hodnoty jako bity [cíl * n + dílek]
    c_tab_k: Vec<u32>,
    c_tab_ids: Vec<u32>,
    c_tab_sizes: Vec<u32>,
    c_tab_dist: Vec<*const u8>,
    c_tab_packed: Vec<u8>,
}

static mut PROBLEMS: Vec<Option<Problem>> = Vec::new();

fn problems() -> &'static mut Vec<Option<Problem>> {
    unsafe { &mut *std::ptr::addr_of_mut!(PROBLEMS) }
}

fn problem(h: u32) -> &'static mut Problem {
    problems()[h as usize].as_mut().unwrap()
}

impl Problem {
    fn adopt(&mut self, ptr: *mut u8, len: usize) -> usize {
        self.bufs.push(Buf { ptr, len });
        self.bufs.len() - 1
    }
    fn drop_buf(&mut self, i: usize) {
        let b = &mut self.bufs[i];
        if b.len > 0 {
            free(b.ptr, b.len);
            b.len = 0;
        }
    }
    fn buf(&self, i: usize) -> &[u8] {
        self.bufs[i].u8()
    }

    #[inline(always)]
    fn goal_of(&self, v: &[u8]) -> i32 {
        let n = self.n;
        unsafe {
            for t in 0..self.targets {
                let masks = self.c_masks.as_ptr().add(t * n);
                let mut i = 0;
                while i < n && (*masks.add(i) >> *v.get_unchecked(i)) & 1 == 1 {
                    i += 1;
                }
                if i == n {
                    return t as i32;
                }
            }
        }
        -1
    }

    /// Další stav s průběžným odřezáváním po databázích (viz evaluator().advance v JS).
    #[inline(always)]
    fn advance(&self, cur: &[u8], m: usize, next: &mut [u8], limit: i32) -> bool {
        unsafe {
            let cur = cur.as_ptr();
            let next = next.as_mut_ptr();
            let trans = self.c_trans.as_ptr();
            let size = self.size.as_ptr();
            let ids = self.c_tab_ids.as_ptr();
            let sizes = self.c_tab_sizes.as_ptr();
            let mut at = 0usize;
            for t in 0..self.c_tab_k.len() {
                let k = *self.c_tab_k.get_unchecked(t) as usize;
                let mut idx: usize = 0;
                for j in at..at + k {
                    let i = *ids.add(j) as usize;
                    let v = *(*trans.add(i)).add(m * *size.add(i) as usize + *cur.add(i) as usize);
                    *next.add(i) = v;
                    idx = idx * *sizes.add(j) as usize + v as usize;
                }
                at += k;
                let dist = *self.c_tab_dist.get_unchecked(t);
                if *self.c_tab_packed.get_unchecked(t) != 0 {
                    let d = (*dist.add(idx >> 1) >> ((idx & 1) << 2)) & 15;
                    if d as i32 > limit || d == PACKED_UNREACHABLE {
                        return false;
                    }
                } else if *dist.add(idx) as i32 > limit {
                    return false;
                }
            }
            for &i in &self.rest {
                let i = i as usize;
                *next.add(i) = *(*trans.add(i)).add(m * *size.add(i) as usize + *cur.add(i) as usize);
            }
        }
        true
    }

    /// Vzdálenost z tabulky blízko cíle, nebo −1.
    #[inline(always)]
    fn near_get(&self, v: &[u8]) -> i32 {
        let near = unsafe { self.near.as_ref().unwrap_unchecked() };
        let n = self.n;
        let h = near_hash(v.as_ptr(), n);
        let fp = (h >> 24) as u16;
        let mut i = (h ^ (h >> 15)) & near.mask;
        let keys = self.bufs[near.keys].ptr as *const u8;
        let slots = near.slots.as_ptr();
        loop {
            let e = unsafe { *slots.add(i as usize) };
            let d = (e & 0xff) as u8;
            if d == UNREACHABLE {
                return -1;
            }
            if e >> 8 == fp {
                let k = unsafe { std::slice::from_raw_parts(keys.add(i as usize * n), n) };
                if k == &v[..n] {
                    return if d <= near.radius { d as i32 } else { -1 };
                }
            }
            i = (i + 1) & near.mask;
        }
    }

    fn near_radius(&self) -> i32 {
        self.near.as_ref().map_or(0, |n| n.radius as i32)
    }

    /// Dolní mez ceny do cíle z databází ceny (costTables), nebo ∞.
    #[inline(always)]
    fn hcost(&self, v: &[u8]) -> f64 {
        let mut h: u16 = 0;
        for t in &self.cost_tables {
            let mut idx: usize = 0;
            for k in 0..t.ids.len() {
                idx = idx * t.sizes[k] as usize + v[t.ids[k] as usize] as usize;
            }
            let d = self.bufs[t.dist].u16()[idx];
            if d > h {
                h = d;
            }
        }
        if h == 0xffff { f64::INFINITY } else { h as f64 * self.q }
    }
}

#[no_mangle]
pub extern "C" fn problem_new(n: u32, m: u32, targets: u32) -> u32 {
    let p = Problem {
        n: n as usize,
        m: m as usize,
        targets: targets as usize,
        size: Vec::new(),
        trans: Vec::new(),
        tables: Vec::new(),
        rest: Vec::new(),
        oks: Vec::new(),
        redundant: 0,
        near: None,
        cost_tables: Vec::new(),
        q: 0.05,
        bufs: Vec::new(),
        c_trans: Vec::new(),
        c_masks: Vec::new(),
        c_tab_k: Vec::new(),
        c_tab_ids: Vec::new(),
        c_tab_sizes: Vec::new(),
        c_tab_dist: Vec::new(),
        c_tab_packed: Vec::new(),
    };
    let list = problems();
    if let Some(i) = list.iter().position(|x| x.is_none()) {
        list[i] = Some(p);
        i as u32
    } else {
        list.push(Some(p));
        (list.len() - 1) as u32
    }
}

/// Přidá buffer (vyhrazený přes `alloc`) do vlastnictví úlohy; vrací jeho číslo.
#[no_mangle]
pub extern "C" fn problem_buffer(h: u32, ptr: *mut u8, len: usize) -> u32 {
    problem(h).adopt(ptr, len) as u32
}

/// Dílek: velikost a buffer přechodů (trans[m * size + v]).
#[no_mangle]
pub extern "C" fn problem_piece(h: u32, size: u32, trans: u32) {
    let p = problem(h);
    p.size.push(size);
    p.trans.push(trans as usize);
}

/// Povolené hodnoty dílku pro cíl (buffer o velikosti dílku, pořadí: cíl × dílek).
#[no_mangle]
pub extern "C" fn problem_ok(h: u32, buf: u32) {
    problem(h).oks.push(buf as usize);
}

#[no_mangle]
pub extern "C" fn problem_redundant(h: u32, buf: u32) {
    problem(h).redundant = buf as usize;
}

fn read_u32(ptr: *const u32, len: u32) -> Vec<u32> {
    unsafe { std::slice::from_raw_parts(ptr, len as usize).to_vec() }
}

/// Pattern databáze (v pořadí, ve kterém se má zkoušet): dílky, jejich velikosti, vzdálenosti.
#[no_mangle]
pub extern "C" fn problem_table(h: u32, ids: *const u32, sizes: *const u32, k: u32, dist: u32, packed: u32) {
    let t = Table { ids: read_u32(ids, k), sizes: read_u32(sizes, k), dist: dist as usize, packed: packed != 0 };
    problem(h).tables.push(t);
}

/// Dílky mimo databáze (počítají se až po všech databázích).
#[no_mangle]
pub extern "C" fn problem_rest(h: u32, ids: *const u32, k: u32) {
    problem(h).rest = read_u32(ids, k);
}

#[no_mangle]
pub extern "C" fn problem_near(h: u32, keys: u32, dist: u32, mask: u32, radius: u32) {
    let p = problem(h);
    let n = p.n;
    let kp = p.bufs[keys as usize].ptr as *const u8;
    let slots = p.buf(dist as usize).iter().enumerate().map(|(i, &d)| {
        if d == UNREACHABLE { 0xff } else { ((near_hash(unsafe { kp.add(i * n) }, n) >> 24) as u16) << 8 | d as u16 }
    }).collect();
    p.near = Some(Near { keys: keys as usize, mask, radius: radius as u8, slots });
    // vzdálenosti jsou ve slotech – původní buffer už není potřeba
    p.drop_buf(dist as usize);
}

/// Databáze ceny (u16, jednotka q); nahrazuje předchozí sadu, když `reset`.
#[no_mangle]
pub extern "C" fn problem_cost_table(h: u32, ids: *const u32, sizes: *const u32, k: u32, dist: u32, q: f64, reset: u32) {
    let p = problem(h);
    if reset != 0 {
        let old: Vec<usize> = p.cost_tables.iter().map(|t| t.dist).collect();
        for b in old {
            p.drop_buf(b);
        }
        p.cost_tables.clear();
    }
    p.q = q;
    p.cost_tables.push(Table { ids: read_u32(ids, k), sizes: read_u32(sizes, k), dist: dist as usize, packed: false });
}

/// Po zadání všech částí: rychlá podoba (ukazatele, bitové masky cílů).
#[no_mangle]
pub extern "C" fn problem_finish(h: u32) {
    let p = problem(h);
    p.c_trans = p.trans.iter().map(|&b| p.bufs[b].ptr as *const u8).collect();
    p.c_masks = p
        .oks
        .iter()
        .map(|&b| p.bufs[b].u8().iter().enumerate().fold(0u32, |acc, (v, &ok)| if ok == 1 { acc | (1 << v) } else { acc }))
        .collect();
    p.c_tab_k = p.tables.iter().map(|t| t.ids.len() as u32).collect();
    p.c_tab_ids = p.tables.iter().flat_map(|t| t.ids.iter().copied()).collect();
    p.c_tab_sizes = p.tables.iter().flat_map(|t| t.sizes.iter().copied()).collect();
    p.c_tab_dist = p.tables.iter().map(|t| p.bufs[t.dist].ptr as *const u8).collect();
    p.c_tab_packed = p.tables.iter().map(|t| t.packed as u8).collect();
}

#[no_mangle]
pub extern "C" fn problem_free(h: u32) {
    if let Some(p) = problems().get_mut(h as usize).and_then(|x| x.take()) {
        for b in p.bufs {
            if b.len > 0 {
                free(b.ptr, b.len);
            }
        }
    }
}

// --- IDA* (search) -----------------------------------------------------------------------

/// Stav jednoho průchodu pro jednu mez a jeden výchozí stav. Pole pro JS:
/// `io` (i32): [0] uzly, [1] branch, [2] doneBranches, [3] cíl řešení,
/// [4..] cesta (indexy tahů) – čte se po SOLUTION.
struct Ida {
    p: u32,
    bound: usize,
    skip: i32,
    shard_index: i32,
    shard_count: i32,
    depth: usize,
    mi: [u16; MAX_DEPTH],
    pending: i32,
    stack: Vec<u8>,
    io: Vec<i32>,
}

static mut IDA: Option<Ida> = None;

fn ida() -> &'static mut Ida {
    unsafe { (*std::ptr::addr_of_mut!(IDA)).as_mut().unwrap() }
}

/// Připraví průchod; výchozí stav se zapíše do `ida_state()` (n bajtů).
#[no_mangle]
pub extern "C" fn ida_new(p: u32) -> *mut i32 {
    let n = problem(p).n;
    let s = Ida {
        p,
        bound: 0,
        skip: 0,
        shard_index: 0,
        shard_count: 0,
        depth: 0,
        mi: [0; MAX_DEPTH],
        pending: -1,
        stack: vec![0; n * (MAX_DEPTH + 1)],
        io: vec![0; 4 + MAX_DEPTH],
    };
    unsafe { *std::ptr::addr_of_mut!(IDA) = Some(s) };
    ida().io.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn ida_state() -> *mut u8 {
    ida().stack.as_mut_ptr()
}

/// Začne průchod (výchozí stav už je v ida_state). io[0..3] nastaví JS (uzly, branch, doneBranches).
#[no_mangle]
pub extern "C" fn ida_start(bound: u32, skip: i32, shard_index: i32, shard_count: i32) {
    let s = ida();
    s.bound = bound as usize;
    s.skip = skip;
    s.shard_index = shard_index;
    s.shard_count = shard_count;
    s.depth = 0;
    s.mi[0] = 0;
    s.pending = -1;
}

#[no_mangle]
pub extern "C" fn ida_run() -> i32 {
    let s = ida();
    let p = problem(s.p);
    let n = p.n;
    let mc = p.m;
    let redundant = p.buf(p.redundant);
    let near_radius = p.near_radius();
    let bound = s.bound;
    let mut nodes = s.io[0] as u32;
    loop {
        let d = s.depth;
        let m;
        if s.pending >= 0 {
            m = s.pending as usize;
            s.pending = -1;
        } else {
            if s.mi[d] as usize >= mc {
                if d == 0 {
                    s.io[0] = nodes as i32;
                    return DONE;
                }
                s.depth -= 1;
                if s.depth == 0 {
                    s.io[2] = s.io[1];
                }
                continue;
            }
            m = s.mi[d] as usize;
            s.mi[d] += 1;
            if d > 0 {
                let prev = s.io[4 + d - 1] as usize;
                if redundant[prev * mc + m] != 0 {
                    continue;
                }
            }
            if d == 0 {
                let idx = s.io[1];
                s.io[1] += 1;
                if idx < s.skip || (s.shard_count > 0 && idx % s.shard_count != s.shard_index) {
                    s.io[2] = s.io[2].max(idx + 1);
                    continue;
                }
            }
            nodes = nodes.wrapping_add(1);
            if nodes % CHECK == 0 {
                s.pending = m as i32;
                s.io[0] = nodes as i32;
                return BUDGET;
            }
        }
        let remaining = bound as i32 - d as i32 - 1;
        let (cur, next) = s.stack.split_at_mut((d + 1) * n);
        let cur = &cur[d * n..];
        let next = &mut next[..n];
        if !p.advance(cur, m, next, remaining) {
            continue;
        }
        let goal = p.goal_of(next);
        s.io[4 + d] = m as i32;
        if remaining == 0 {
            if goal >= 0 {
                s.io[3] = goal;
                s.io[0] = nodes as i32;
                return SOLUTION;
            }
            continue;
        }
        if goal >= 0 {
            continue;
        }
        if remaining <= near_radius {
            let nd = p.near_get(next);
            if nd < 0 || nd > remaining {
                continue;
            }
        }
        s.depth += 1;
        s.mi[s.depth] = 0;
    }
}

// --- větve a meze podle ceny (searchCost) --------------------------------------------------

/// Model ceny jako tabulky: next[ctx * M + m] (−1 = zatím nespočteno) a price[ctx * M + m].
/// `io` (f64): [0] uzly, [1] nalezeno, [2] mez (cena nejlepšího), [3] done, [4] cíl,
/// [5] cena řešení, [6] chybějící ctx; cesta v `cost_path()`.
struct Bnb {
    p: u32,
    length: usize,
    min_move: f64,
    use_hcost: bool,
    skip: i64,
    shard_index: i32,
    shard_count: i32,
    root_index: i64,
    finish: Vec<f64>,
    next: Vec<i32>,
    price: Vec<f64>,
    ctx_cap: usize,
    depth: usize,
    phase: [u8; MAX_DEPTH],
    ctx: [i32; MAX_DEPTH],
    g: [f64; MAX_DEPTH],
    k: [u16; MAX_DEPTH],
    q: [u16; MAX_DEPTH],
    ord: Vec<u16>,
    cs: Vec<f64>,
    pending: bool,
    stack: Vec<u8>,
    path: Vec<i32>,
    io: Vec<f64>,
}

static mut BNB: Option<Bnb> = None;

fn bnb() -> &'static mut Bnb {
    unsafe { (*std::ptr::addr_of_mut!(BNB)).as_mut().unwrap() }
}

#[no_mangle]
pub extern "C" fn cost_new(p: u32, length: u32, min_move: f64, use_hcost: u32, targets: u32, shard_index: i32, shard_count: i32) -> *mut f64 {
    let pr = problem(p);
    let (n, mc) = (pr.n, pr.m);
    let len = (length as usize).min(MAX_DEPTH - 1);
    let s = Bnb {
        p,
        length: len,
        min_move,
        use_hcost: use_hcost != 0,
        skip: 0,
        shard_index,
        shard_count,
        root_index: 0,
        finish: vec![0.0; targets as usize],
        next: vec![-1; mc * 16],
        price: vec![0.0; mc * 16],
        ctx_cap: 16,
        depth: 0,
        phase: [0; MAX_DEPTH],
        ctx: [0; MAX_DEPTH],
        g: [0.0; MAX_DEPTH],
        k: [0; MAX_DEPTH],
        q: [0; MAX_DEPTH],
        ord: vec![0; MAX_DEPTH * mc],
        cs: vec![0.0; MAX_DEPTH * mc],
        pending: false,
        stack: vec![0; n * (MAX_DEPTH + 1)],
        path: vec![0; MAX_DEPTH],
        io: vec![0.0; 8],
    };
    unsafe { *std::ptr::addr_of_mut!(BNB) = Some(s) };
    bnb().io.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn cost_state() -> *mut u8 {
    bnb().stack.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn cost_path() -> *mut i32 {
    bnb().path.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn cost_finish() -> *mut f64 {
    bnb().finish.as_mut_ptr()
}

/// Ceny a následné stavy ruky pro ctx (všechny tahy) – po NEED_COST.
#[no_mangle]
pub extern "C" fn cost_fill(ctx: u32, next: *const i32, price: *const f64) {
    let s = bnb();
    let mc = problem(s.p).m;
    let ctx = ctx as usize;
    while ctx >= s.ctx_cap {
        s.ctx_cap *= 2;
        s.next.resize(s.ctx_cap * mc, -1);
        s.price.resize(s.ctx_cap * mc, 0.0);
    }
    unsafe {
        s.next[ctx * mc..(ctx + 1) * mc].copy_from_slice(std::slice::from_raw_parts(next, mc));
        s.price[ctx * mc..(ctx + 1) * mc].copy_from_slice(std::slice::from_raw_parts(price, mc));
    }
}

/// Začne průchod z jednoho výchozího stavu (už v cost_state); io[0..3] nastaví JS.
#[no_mangle]
pub extern "C" fn cost_start(root_index: u32, skip: f64, ctx: i32, g0: f64) {
    let s = bnb();
    s.root_index = root_index as i64;
    s.skip = skip as i64;
    s.depth = 0;
    s.phase[0] = 0;
    s.ctx[0] = ctx;
    s.g[0] = g0;
    s.pending = false;
}

#[no_mangle]
pub extern "C" fn cost_run() -> i32 {
    let s = bnb();
    let p = problem(s.p);
    let n = p.n;
    let mc = p.m;
    let redundant = p.buf(p.redundant);
    let near_radius = p.near_radius();
    let length = s.length;
    let mut nodes = s.io[0] as u64;
    let mut bound = s.io[2];
    let mut done = s.io[3] as i64;
    macro_rules! save {
        () => {
            s.io[0] = nodes as f64;
            s.io[2] = bound;
            s.io[3] = done as f64;
        };
    }
    loop {
        let d = s.depth;
        let remaining = length as i32 - d as i32 - 1;
        let rest = remaining as f64 * s.min_move;
        let ctx = s.ctx[d] as usize;
        if s.phase[d] == 0 {
            // tahy seřazené od nejlevnějšího
            if ctx >= s.ctx_cap || s.next[ctx * mc] < 0 {
                s.io[6] = ctx as f64;
                save!();
                return NEED_COST;
            }
            let prev = if d > 0 { s.path[d - 1] } else { -1 };
            let ord = &mut s.ord[d * mc..(d + 1) * mc];
            let cs = &mut s.cs[d * mc..(d + 1) * mc];
            let mut k = 0usize;
            for m in 0..mc {
                if prev >= 0 && redundant[prev as usize * mc + m] != 0 {
                    continue;
                }
                if d == 0 && s.shard_count > 0 && m as i32 % s.shard_count != s.shard_index {
                    continue;
                }
                cs[m] = s.price[ctx * mc + m];
                let mut j = k;
                k += 1;
                while j > 0 && cs[ord[j - 1] as usize] > cs[m] {
                    ord[j] = ord[j - 1];
                    j -= 1;
                }
                ord[j] = m as u16;
            }
            s.k[d] = k as u16;
            s.q[d] = 0;
            s.phase[d] = 1;
        }
        let q = s.q[d] as usize;
        let mut end = q >= s.k[d] as usize;
        if !end {
            let m = s.ord[d * mc + q] as usize;
            let idx = if d == 0 { s.root_index * mc as i64 + q as i64 } else { 0 };
            if d == 0 && idx < s.skip && !s.pending {
                s.q[d] += 1;
                continue;
            }
            let g2 = s.g[d] + s.cs[d * mc + m];
            if g2 + rest >= bound {
                end = true;
            } else {
                if !s.pending {
                    nodes += 1;
                    if nodes % CHECK as u64 == 0 {
                        s.pending = true;
                        save!();
                        return BUDGET;
                    }
                }
                s.pending = false;
                s.path[d] = m as i32;
                let (cur, next) = s.stack.split_at_mut((d + 1) * n);
                let cur = &cur[d * n..];
                let next = &mut next[..n];
                if !p.advance(cur, m, next, remaining) {
                    if d == 0 {
                        done = idx + 1;
                    }
                    s.q[d] += 1;
                    continue;
                }
                let goal = p.goal_of(next);
                if remaining == 0 {
                    let total = if goal >= 0 { g2 + s.finish[goal as usize] } else { g2 };
                    if d == 0 {
                        done = idx + 1;
                    }
                    s.q[d] += 1;
                    if goal >= 0 && total < bound {
                        bound = total;
                        s.io[1] += 1.0;
                        s.io[4] = goal as f64;
                        s.io[5] = total;
                        save!();
                        return SOLUTION;
                    }
                    continue;
                }
                let mut descend = goal < 0 && !(s.use_hcost && g2 + p.hcost(next) >= bound);
                if descend && remaining <= near_radius {
                    let nd = p.near_get(next);
                    descend = nd >= 0 && nd <= remaining;
                }
                if descend {
                    let c2 = s.next[ctx * mc + m];
                    s.depth += 1;
                    s.phase[s.depth] = 0;
                    s.ctx[s.depth] = c2;
                    s.g[s.depth] = g2;
                    continue;
                }
                if d == 0 {
                    done = idx + 1;
                }
                s.q[d] += 1;
                continue;
            }
        }
        if end {
            if d == 0 {
                done = done.max((s.root_index + 1) * mc as i64);
                save!();
                return DONE;
            }
            s.depth -= 1;
            let pd = s.depth;
            if pd == 0 {
                done = s.root_index * mc as i64 + s.q[0] as i64 + 1;
            }
            s.q[pd] += 1;
        }
    }
}

// --- stavba pattern databáze (buildTable) ------------------------------------------------

/// Zpětné BFS pro skupinu k dílků: `sizes` (k × u32), `inv` (k ukazatelů na inverzní
/// přechody inv[m * size + v]), `oks` (cíle × k ukazatelů na povolené hodnoty).
/// Výsledek do `dist` (total bajtů, 255 = nedosažitelné).
#[no_mangle]
pub extern "C" fn build_table(k: u32, sizes: *const u32, inv: *const *const u8, targets: u32, oks: *const *const u8, mc: u32, dist: *mut u8, total: u32) {
    let k = k as usize;
    let total = total as usize;
    let mc = mc as usize;
    unsafe {
        let sizes = std::slice::from_raw_parts(sizes, k);
        let inv = std::slice::from_raw_parts(inv, k);
        let oks = std::slice::from_raw_parts(oks, targets as usize * k);
        let dist = std::slice::from_raw_parts_mut(dist, total);
        let mut digits = [0usize; 16];
        let decode = |mut idx: usize, digits: &mut [usize; 16]| {
            for i in (0..k).rev() {
                let s = sizes[i] as usize;
                digits[i] = idx % s;
                idx /= s;
            }
        };
        let mut frontier = 0usize;
        for idx in 0..total {
            decode(idx, &mut digits);
            let mut any = false;
            for t in 0..targets as usize {
                if (0..k).all(|i| *oks[t * k + i].add(digits[i]) == 1) {
                    any = true;
                    break;
                }
            }
            dist[idx] = if any { frontier += 1; 0 } else { UNREACHABLE };
        }
        let mut d: u8 = 0;
        while frontier > 0 && d < UNREACHABLE - 1 {
            frontier = 0;
            for idx in 0..total {
                if dist[idx] != d {
                    continue;
                }
                decode(idx, &mut digits);
                for m in 0..mc {
                    let mut pred = 0usize;
                    for i in 0..k {
                        let s = sizes[i] as usize;
                        pred = pred * s + *inv[i].add(m * s + digits[i]) as usize;
                    }
                    if dist[pred] == UNREACHABLE {
                        dist[pred] = d + 1;
                        frontier += 1;
                    }
                }
            }
            d += 1;
        }
    }
}

/// Cílové stavy skupiny: hodnoty dílků, které splňují aspoň jeden cíl (sdílené BFS i Dijkstrou).
unsafe fn is_goal(digits: &[usize], k: usize, targets: usize, oks: &[*const u8]) -> bool {
    (0..targets).any(|t| (0..k).all(|i| *oks[t * k + i].add(digits[i]) == 1))
}

// --- databáze ceny (buildCostTable) -------------------------------------------------------

/// Nejnižší cena do cíle (Dijkstra s kbelíky, ceny tahů `weights` v celých jednotkách).
#[no_mangle]
pub extern "C" fn build_cost_table(k: u32, sizes: *const u32, inv: *const *const u8, targets: u32, oks: *const *const u8, mc: u32, weights: *const u32, dist: *mut u16, total: u32) {
    const INF: u16 = 0xffff;
    let k = k as usize;
    let total = total as usize;
    let mc = mc as usize;
    unsafe {
        let sizes = std::slice::from_raw_parts(sizes, k);
        let inv = std::slice::from_raw_parts(inv, k);
        let oks = std::slice::from_raw_parts(oks, targets as usize * k);
        let weights = std::slice::from_raw_parts(weights, mc);
        let dist = std::slice::from_raw_parts_mut(dist, total);
        let mut digits = [0usize; 16];
        let decode = |mut idx: usize, digits: &mut [usize; 16]| {
            for i in (0..k).rev() {
                let s = sizes[i] as usize;
                digits[i] = idx % s;
                idx /= s;
            }
        };
        let mut buckets: Vec<Vec<u32>> = vec![Vec::new()];
        for idx in 0..total {
            decode(idx, &mut digits);
            if is_goal(&digits[..k], k, targets as usize, oks) {
                dist[idx] = 0;
                buckets[0].push(idx as u32);
            } else {
                dist[idx] = INF;
            }
        }
        let mut d = 0usize;
        while d < buckets.len() {
            let list = std::mem::take(&mut buckets[d]);
            for &idx in &list {
                let idx = idx as usize;
                if dist[idx] as usize != d {
                    continue;
                }
                decode(idx, &mut digits);
                for m in 0..mc {
                    let nd = d + weights[m] as usize;
                    if nd >= INF as usize {
                        continue;
                    }
                    let mut pred = 0usize;
                    for i in 0..k {
                        let s = sizes[i] as usize;
                        pred = pred * s + *inv[i].add(m * s + digits[i]) as usize;
                    }
                    if (nd as u16) < dist[pred] {
                        dist[pred] = nd as u16;
                        if nd >= buckets.len() {
                            buckets.resize_with(nd + 1, Vec::new);
                        }
                        buckets[nd].push(pred as u32);
                    }
                }
            }
            d += 1;
        }
    }
}

// --- tabulka blízko cíle (buildNear) ------------------------------------------------------

/// Výsledek build_near pro JS: [cap, radius, count, keys ptr, dist ptr] (u32).
static mut NEAR_OUT: [u32; 5] = [0; 5];

#[no_mangle]
pub extern "C" fn near_out() -> *const u32 {
    std::ptr::addr_of!(NEAR_OUT) as *const u32
}

/// Zpětné BFS všech stavů n sledovaných dílků do vzdálenosti, dokud se vejdou do `limit`
/// (hašovací tabulka s otevřeným adresováním jako buildNear v JS; cap = mocnina dvou).
/// Klíče (cap × n) a vzdálenosti (cap) vyhradí jádro, JS si je zkopíruje a uvolní (free).
#[no_mangle]
pub extern "C" fn build_near(n: u32, sizes: *const u32, inv: *const *const u8, targets: u32, oks: *const *const u8, mc: u32, limit: u32, cap: u32) {
    let n = n as usize;
    let mc = mc as usize;
    let cap = cap as usize;
    let mask = (cap - 1) as u32;
    let limit = limit as usize;
    unsafe {
        let sizes = std::slice::from_raw_parts(sizes, n);
        let inv = std::slice::from_raw_parts(inv, n);
        let oks = std::slice::from_raw_parts(oks, targets as usize * n);
        let keys_ptr = alloc(cap * n);
        let dist_ptr = alloc(cap);
        let keys = std::slice::from_raw_parts_mut(keys_ptr, cap * n);
        let dist = std::slice::from_raw_parts_mut(dist_ptr, cap);
        dist.fill(UNREACHABLE);
        let mut count = 0usize;
        let slot = |v: &[u8], keys: &[u8], dist: &[u8]| -> usize {
            let h = near_hash(v.as_ptr(), n);
            let mut i = ((h ^ (h >> 15)) & mask) as usize;
            loop {
                if dist[i] == UNREACHABLE || keys[i * n..i * n + n] == v[..n] {
                    return i;
                }
                i = (i + 1) & mask as usize;
            }
        };
        // vrstva 0: pro každý cíl kartézský součin povolených hodnot dílků
        let mut frontier: Vec<u8> = Vec::new();
        let mut v = vec![0u8; n];
        for t in 0..targets as usize {
            let allowed: Vec<Vec<u8>> = (0..n).map(|i| (0..sizes[i] as usize).filter(|&x| *oks[t * n + i].add(x) == 1).map(|x| x as u8).collect()).collect();
            let g0: usize = allowed.iter().map(|a| a.len()).product();
            for g in 0..g0 {
                let mut r = g;
                for i in (0..n).rev() {
                    let len = allowed[i].len();
                    v[i] = allowed[i][r % len];
                    r /= len;
                }
                let i = slot(&v, keys, dist);
                if dist[i] == UNREACHABLE {
                    keys[i * n..i * n + n].copy_from_slice(&v);
                    dist[i] = 0;
                    count += 1;
                    frontier.extend_from_slice(&v);
                }
            }
        }
        let mut radius: u8 = 0;
        let mut pred = vec![0u8; n];
        loop {
            let states = frontier.len() / n;
            let mut next: Vec<u8> = Vec::new();
            let mut added = 0usize;
            let mut full = false;
            'outer: for s in 0..states {
                let off = s * n;
                for m in 0..mc {
                    for i in 0..n {
                        let sz = sizes[i] as usize;
                        pred[i] = *inv[i].add(m * sz + frontier[off + i] as usize);
                    }
                    let at = slot(&pred, keys, dist);
                    if dist[at] != UNREACHABLE {
                        continue;
                    }
                    if count >= limit {
                        full = true;
                        break 'outer;
                    }
                    keys[at * n..at * n + n].copy_from_slice(&pred);
                    dist[at] = radius + 1;
                    count += 1;
                    next.extend_from_slice(&pred);
                    added += 1;
                }
            }
            if full {
                // nedokončenou vrstvu zahodit (sloty zůstanou obsazené, viz JS)
                for d in dist.iter_mut() {
                    if *d == radius + 1 {
                        *d = UNREACHABLE - 1;
                    }
                }
                break;
            }
            if added == 0 {
                break;
            }
            radius += 1;
            frontier = next;
        }
        NEAR_OUT = [cap as u32, radius as u32, count as u32, keys_ptr as u32, dist_ptr as u32];
    }
}
