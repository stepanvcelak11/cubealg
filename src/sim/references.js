// Vestavěné metody k porovnání v simulátoru: spočtené stejným simulátorem ze šablon
// (bench/method.mjs, semínko 1, 100 zamíchání, 3 s hledání na krok, bez sad – každý krok
// hledáním), aby srovnání s tvou metodou bylo férové, a k nim data skutečných skladačů.
// Vygenerováno: node bench/references.mjs.

export const REFERENCE_NOTE = 'Vestavěné metody spočítal stejný simulátor (každý krok hledáním, 100 zamíchání), takže ukazují metodu, ne konkrétního skladače.';

export const REFERENCES = [
  {
    id: 'cfop',
    name: 'CFOP',
    n: 100,
    seconds: 3,
    moves: 60.85,
    ci: 1.26,
    median: 62,
    min: 44,
    max: 74,
    score: 76.08,
    steps: [
      {
        title: 'Kříž',
        moves: 7.2,
        median: 7,
        p90: 9,
        score: 10.97,
        skipped: 0,
        recog: 0,
        kind: 'intuitive'
      },
      {
        title: 'Pár 1',
        moves: 6.49,
        median: 7,
        p90: 8,
        score: 6.08,
        skipped: 0.02,
        recog: 0.4,
        kind: 'intuitive'
      },
      {
        title: 'Pár 2',
        moves: 6.92,
        median: 7,
        p90: 9,
        score: 6.44,
        skipped: 0,
        recog: 0.4,
        kind: 'intuitive'
      },
      {
        title: 'Pár 3',
        moves: 7.38,
        median: 7,
        p90: 9,
        score: 7.09,
        skipped: 0,
        recog: 0.4,
        kind: 'intuitive'
      },
      {
        title: 'Pár 4',
        moves: 8.45,
        median: 8,
        p90: 12,
        score: 8.04,
        skipped: 0,
        recog: 0.4,
        kind: 'intuitive'
      },
      {
        title: 'OLL',
        moves: 10.33,
        median: 10,
        p90: 14,
        score: 15.09,
        skipped: 0.02,
        recog: 0.5,
        kind: 'alg'
      },
      {
        title: 'PLL',
        moves: 14.08,
        median: 15,
        p90: 18,
        score: 22.38,
        skipped: 0.02,
        recog: 0.6,
        kind: 'alg'
      }
    ],
    description: 'kříž, 4 páry F2L do kteréhokoli slotu, OLL a PLL (vnější tahy).',
    real: {
      moves: '55–60 (obvykle kolem 57)',
      best: 'průměr 3,51 s – světový rekord (Yiheng Wang, 2026)',
      note: 'metoda většiny světové špičky',
      sources: [
        {
          title: 'Cuberpal – CFOP vs Roux (čísla ze Speedsolving wiki)',
          url: 'https://www.cuberpal.com/guides/cfop-vs-roux'
        },
        {
          title: 'speedcubing.org – výběr metody',
          url: 'https://speedcubing.org/pages/guide-to-choosing-a-speedsolving-method'
        },
        {
          title: 'Wikipedie – Speedcubing (rekordy)',
          url: 'https://en.wikipedia.org/wiki/Speedcubing'
        }
      ]
    }
  },
  {
    id: 'roux',
    name: 'Roux',
    n: 100,
    seconds: 3,
    moves: 43.77,
    ci: 0.88,
    median: 44,
    min: 30,
    max: 53,
    score: 53.39,
    steps: [
      {
        title: 'První blok',
        moves: 9.2,
        median: 9,
        p90: 11,
        score: 11.98,
        skipped: 0,
        recog: 0,
        kind: 'blocks'
      },
      {
        title: 'Druhý blok',
        moves: 11.76,
        median: 12,
        p90: 14,
        score: 11.31,
        skipped: 0,
        recog: 0.3,
        kind: 'blocks'
      },
      {
        title: 'CMLL',
        moves: 11.18,
        median: 11,
        p90: 14,
        score: 14.41,
        skipped: 0,
        recog: 0.6,
        kind: 'alg'
      },
      {
        title: 'LSE',
        moves: 11.63,
        median: 12,
        p90: 14,
        score: 15.7,
        skipped: 0,
        recog: 0.4,
        kind: 'alg'
      }
    ],
    description: 'první a druhý blok 1×2×3, CMLL a LSE ⟨M, U⟩.',
    real: {
      moves: '45–50 (obvykle kolem 48)',
      best: 'oficiální průměr pod 6 s mají 4 skladači (např. Sean Patrick Villanueva); neoficiálně 4,77 s',
      note: 'méně tahů, ale pomalejší točení (bloky, tahy M)',
      sources: [
        {
          title: 'Cuberpal – CFOP vs Roux (čísla ze Speedsolving wiki)',
          url: 'https://www.cuberpal.com/guides/cfop-vs-roux'
        },
        {
          title: 'speedcubing.org – výběr metody',
          url: 'https://speedcubing.org/pages/guide-to-choosing-a-speedsolving-method'
        },
        {
          title: 'scheopner.com – Roux (rekordy skladačů Roux)',
          url: 'https://www.scheopner.com/cube/'
        }
      ]
    }
  },
  {
    id: 'zz',
    name: 'ZZ',
    n: 100,
    seconds: 3,
    moves: 53.7,
    ci: 1.06,
    median: 54,
    min: 35,
    max: 69,
    score: 66.43,
    steps: [
      {
        title: 'EOLine',
        moves: 7.7,
        median: 8,
        p90: 10,
        score: 12.26,
        skipped: 0,
        recog: 0,
        kind: 'intuitive'
      },
      {
        title: 'Levý blok',
        moves: 11.48,
        median: 11,
        p90: 15,
        score: 12.52,
        skipped: 0,
        recog: 0.3,
        kind: 'blocks'
      },
      {
        title: 'Pravý blok',
        moves: 11.8,
        median: 12,
        p90: 14,
        score: 10.55,
        skipped: 0,
        recog: 0.3,
        kind: 'blocks'
      },
      {
        title: 'OCLL',
        moves: 8.68,
        median: 9,
        p90: 11,
        score: 9.49,
        skipped: 0.04,
        recog: 0.5,
        kind: 'alg'
      },
      {
        title: 'PLL',
        moves: 14.04,
        median: 15,
        p90: 18,
        score: 21.61,
        skipped: 0.01,
        recog: 0.6,
        kind: 'alg'
      }
    ],
    description: 'EOLine, bloky ⟨R, U, L⟩, OCLL a PLL.',
    real: {
      moves: '50–55 (se ZBLL méně)',
      best: 'spolehlivý přehled rekordů ZZ jsem nenašel',
      note: 'oblíbená hlavně na jednu ruku (OH)',
      sources: [
        {
          title: 'speedcubing.org – výběr metody',
          url: 'https://speedcubing.org/pages/guide-to-choosing-a-speedsolving-method'
        }
      ]
    }
  }
];
