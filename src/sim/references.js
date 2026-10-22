// Vestavěné metody k porovnání v simulátoru: spočtené stejným simulátorem (bench/method.mjs,
// semínko 1, 30 zamíchání, 3 s hledání na krok, bez sad – každý krok hledáním), aby
// srovnání s tvou metodou bylo férové. Vygenerováno: node bench/references.mjs.

export const REFERENCE_NOTE = 'Vestavěné metody spočítal stejný simulátor (každý krok hledáním, 30 zamíchání), takže ukazují metodu, ne konkrétního skladače – člověk při skládání obvykle nenajde tak krátká řešení kroků.';

export const REFERENCES = [
  {
    id: 'cfop',
    name: 'CFOP',
    n: 30,
    moves: 62.37,
    ci: 2.11,
    median: 63,
    min: 50,
    max: 72,
    score: 82.99,
    steps: [
      {
        title: 'Kříž',
        moves: 7.5,
        median: 8,
        p90: 10,
        score: 10.85,
        skipped: 0,
        recog: 0
      },
      {
        title: 'Pár 1',
        moves: 7,
        median: 7,
        p90: 10,
        score: 7.99,
        skipped: 0,
        recog: 0.4
      },
      {
        title: 'Pár 2',
        moves: 7.93,
        median: 8,
        p90: 10,
        score: 9.13,
        skipped: 0,
        recog: 0.4
      },
      {
        title: 'Pár 3',
        moves: 8.23,
        median: 8,
        p90: 12,
        score: 8.94,
        skipped: 0,
        recog: 0.4
      },
      {
        title: 'Pár 4',
        moves: 8.43,
        median: 8,
        p90: 11,
        score: 10.88,
        skipped: 0,
        recog: 0.4
      },
      {
        title: 'OLL',
        moves: 9.93,
        median: 10,
        p90: 13,
        score: 14.93,
        skipped: 0,
        recog: 0.5
      },
      {
        title: 'PLL',
        moves: 13.33,
        median: 13,
        p90: 17,
        score: 20.26,
        skipped: 0,
        recog: 0.6
      }
    ],
    description: 'kříž, 4 páry F2L zvlášť, OLL a PLL (vnější tahy).'
  },
  {
    id: 'roux',
    name: 'Roux',
    n: 30,
    moves: 45.07,
    ci: 1.49,
    median: 45,
    min: 35,
    max: 53,
    score: 55.38,
    steps: [
      {
        title: 'První blok',
        moves: 9.33,
        median: 9,
        p90: 12,
        score: 12.07,
        skipped: 0,
        recog: 0
      },
      {
        title: 'Druhý blok',
        moves: 12.2,
        median: 12,
        p90: 15,
        score: 11.51,
        skipped: 0,
        recog: 0.3
      },
      {
        title: 'CMLL',
        moves: 11.63,
        median: 12,
        p90: 14,
        score: 15.67,
        skipped: 0,
        recog: 0.6
      },
      {
        title: 'LSE',
        moves: 11.9,
        median: 12,
        p90: 14,
        score: 16.13,
        skipped: 0,
        recog: 0.4
      }
    ],
    description: 'první a druhý blok 1×2×3, CMLL a LSE ⟨M, U⟩.'
  },
  {
    id: 'zz',
    name: 'ZZ',
    n: 30,
    moves: 53.9,
    ci: 1.62,
    median: 54,
    min: 47,
    max: 63,
    score: 66.85,
    steps: [
      {
        title: 'EOLine',
        moves: 7.77,
        median: 8,
        p90: 10,
        score: 12.45,
        skipped: 0,
        recog: 0
      },
      {
        title: 'Levý blok',
        moves: 11.2,
        median: 11,
        p90: 14,
        score: 12.03,
        skipped: 0,
        recog: 0.3
      },
      {
        title: 'Pravý blok',
        moves: 11.53,
        median: 11,
        p90: 14,
        score: 10.39,
        skipped: 0,
        recog: 0.3
      },
      {
        title: 'OCLL',
        moves: 9.2,
        median: 10,
        p90: 11,
        score: 10.32,
        skipped: 0,
        recog: 0.5
      },
      {
        title: 'PLL',
        moves: 14.2,
        median: 15,
        p90: 18,
        score: 21.66,
        skipped: 0,
        recog: 0.6
      }
    ],
    description: 'EOLine, bloky ⟨R, U, L⟩, OCLL a PLL.'
  }
];
