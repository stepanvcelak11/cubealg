// Vygenerováno: node bench/corpus.mjs 10 > src/ergonomics/corpus.js
// Oblíbené algoritmy skladačů (ref) a alternativy pro stejný případ, které našlo hledání.
// Dvojice ze stejného případu se porovnávají (Tahy a váhy → Porovnat algoritmy) a podle
// nich se ladí výchozí váhy (bench/fit.mjs).
export const CORPUS = [
 {
  "name": "T-perm",
  "kind": "PLL",
  "ref": "R U R' U' R' F R2 U' R' U' R U R' F'",
  "alts": [
   "R U L' U R' U2 L U R U2 L' U2 L U' R'",
   "F R U' R' U R U R2 F' R U R U' R'",
   "R U L' U2 L U2 R' U' L' U2 R U' L U' R'",
   "R' U' L U2 L' U2 R U L U2 R' U L' U R"
  ]
 },
 {
  "name": "Ja-perm",
  "kind": "PLL",
  "ref": "R' U L' U2 R U' R' U2 R L",
  "alts": [
   "R' U r' F2 R F' R' F2 R r",
   "F' U2 R F R' U R F' R' U F",
   "R' U F' r' F' r F2 R' F' R2",
   "R' U L' U2 R U' R' L r' F2 R r",
   "R' U L' U2 R U' R' L r' F2 R2 M'",
   "R' U L' U2 L M F' R' F2 R2 M'",
   "R' U L' U2 R U M U2 R' U2 L r",
   "R' U L' U2 R U R' L F2 R' F2 R2"
  ]
 },
 {
  "name": "Jb-perm",
  "kind": "PLL",
  "ref": "R U R' F' R U R' U' R' F R2 U' R'",
  "alts": [
   "R U' L U2 R' U R U2 R' L'",
   "R L U2 R' U' R U2 L' U R'",
   "R U' F U' R' U' R U F' U2 R'",
   "R L U2 R' U' R U2 r' F L' M'",
   "R L U2 R' U' r U2 L' U2 M U' R'",
   "R L U2 R' U' R L' r B2 r' U R'",
   "R L U2 L' M' B' R B2 r' U R'",
   "L2 M F2 L' M' U' R U2 L' U R'"
  ]
 },
 {
  "name": "Ua-perm",
  "kind": "PLL",
  "ref": "R U' R U R U R U' R' U' R2",
  "alts": [
   "M2 U M' U2 M U M2",
   "M2 U M U2 M' U M2",
   "R2 D' M' U2 M U2 D R2",
   "F2 U' M' U2 M U' F2",
   "R2 D' r U2 M U2 R' D R2",
   "M2 U r' U2 M' U2 R U' M2",
   "r2 U M2 U2 M' U2 M' U' r2",
   "D M2 U M U2 M' U M2 D'"
  ]
 },
 {
  "name": "Ub-perm",
  "kind": "PLL",
  "ref": "R2 U R U R' U' R' U' R' U R'",
  "alts": [
   "L' U' L U R U R' U2 L' U L U R U' R'",
   "M2 U' M' U2 M U' M2",
   "M2 U' M U2 M' U' M2",
   "R2 D' R U2 M' U2 r' D R2",
   "F2 U M' U2 M U F2",
   "R2 U2 D' M' U2 M D R2",
   "M2 U' r' U2 M' U2 R U M2",
   "B2 U M U2 M' U B2"
  ]
 },
 {
  "name": "H-perm",
  "kind": "PLL",
  "ref": "M2 U M2 U2 M2 U M2",
  "alts": [
   "M2 U2 M2 U M2 U2 M2",
   "M' U M2 U2 M2 U M2 U2 M'",
   "M' U2 M2 U M2 U2 M2 U M'",
   "M2 U2 M2 U' M2 U2 M2",
   "D M2 U M2 U2 M2 U M2 D'",
   "M2 U R2 U2 M2 U2 r2 U' M2",
   "F2 M2 F2 U' r U2 M2 U2 r'",
   "F2 M2 F2 U' F2 M2 F2"
  ]
 },
 {
  "name": "Z-perm",
  "kind": "PLL",
  "ref": "M' U M2 U M2 U M' U2 M2",
  "alts": [
   "M2 U2 M' U M2 U M2 U M'",
   "M' U2 M2 U2 M' U M2 U M2",
   "M U M2 U M2 U M U2 M2",
   "M2 U2 M U M2 U M2 U M",
   "r U2 M2 U2 R' M' U M2 U M2",
   "r U2 M2 U2 M2 r' U M2 U M2",
   "F2 M2 F2 M2 U M2 U M2",
   "M U2 D2 M' U D2 M2 U M2"
  ]
 },
 {
  "name": "Y-perm",
  "kind": "PLL",
  "ref": "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  "alts": [
   "R U R' U L' U2 R U2 L U2 R' U L' U L",
   "R U R' U L' U2 r U2 L U2 r' U L' U L",
   "R' U' R2 U' L U2 R' U R U2 R' L' U R' U R",
   "R U R' U L' U2 L F2 r U2 r' U L' U L",
   "R U R' U R' F2 R F2 R U2 R' U L' U L",
   "R U R' U L' U2 L M F2 r U2 R' U L' U L",
   "R U R' U' M U2 L' U2 r U2 L U2 R' U L' U L",
   "R U R' U L' U2 R M U2 L U2 R' M' U L' U L"
  ]
 },
 {
  "name": "Aa-perm",
  "kind": "PLL",
  "ref": "R' F R' B2 R F' R' B2 R2",
  "alts": [
   "R' U2 R2 U' L' U R' U' L U R' U2 R",
   "r2 F2 r' U' r F2 r' U r'",
   "F U' r F' r' U' r F r' U2 F'",
   "L' r' U2 L r2 U' r F2 r' U r'",
   "L r D2 L' U' r F2 r' U r'",
   "F' r U' R2 U r' F' R2 F2",
   "R U' R F2 R' U R' U' R2 F2 R2",
   "L r D2 L' U' L D2 L' U r'"
  ]
 },
 {
  "name": "Ab-perm",
  "kind": "PLL",
  "ref": "R2 B2 R F R' B2 R F' R",
  "alts": [
   "r U' r F2 r' U r F2 r2",
   "r U' r F2 r' U L D2 L' r'",
   "F U2 r F' r' U r F r' U F'",
   "r U' L D2 L' U r F2 r2",
   "F2 R' L' M' U L U' R2 U r' F",
   "F2 R2 F r U' R2 U r' F",
   "r U' L D2 L' U L D2 L' r'",
   "R' U2 R U' L' U R U' L U R2 U2 R"
  ]
 },
 {
  "name": "Ra-perm",
  "kind": "PLL",
  "ref": "R U' R' U' R U R D R' U' R D' R' U2 R'",
  "alts": [
   "R U L' U' L U2 R' U2 L' U L U R U2 R'",
   "R U' L' U' L' U R' U' L U L U' R U2 R'",
   "R2 F2 U R U R' U' R' U' F2 R' U R'",
   "R U' R' U2 L' U R U' L2 U' R2 U L' U' R"
  ]
 },
 {
  "name": "Rb-perm",
  "kind": "PLL",
  "ref": "R' U2 R U2 R' F R U R' U' R' F' R2",
  "alts": [
   "R' U2 R' D' R U' R' D R U R U' R' U' R",
   "r' U2 R U2 R' M' F R U R' U' R' F' R2",
   "R' M' U2 R U2 r' F R U R' U' R' F' R2",
   "r' U2 R U2 M2 r' F R U R' U' R' F' R2",
   "R' U2 R U L U L' U2 R' U2 L U' L' U R",
   "R' M' U2 R U2 L' U L M U R' U' R' F' R2",
   "R2 r U2 R U2 r' F R U R' U' R' F' R2",
   "R' M2 U2 R U2 R' M2 F R U R' U' R' F' R2"
  ]
 },
 {
  "name": "F-perm",
  "kind": "PLL",
  "ref": "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  "alts": []
 },
 {
  "name": "Ga-perm",
  "kind": "PLL",
  "ref": "R2 U R' U R' U' R U' R2 D U' R' U R D'",
  "alts": [
   "D' R2 U R' U R' U' R U' R2 U' D R' U R",
   "R2 U R' U R' U' R U' R2 U' D R' U R D'",
   "M r' D2 r2 U' L U2 R' U R U2 L U2 R' L2",
   "R L U2 L' U' R' U2 L U L2 U2 R U' R' U2 L",
   "D' R2 U R' U L' M' B' L M U' R2 U' D R' U R"
  ]
 },
 {
  "name": "Gb-perm",
  "kind": "PLL",
  "ref": "R' U' R U D' R2 U R' U R U' R U' R2 D",
  "alts": [
   "D R' U' R U D' R2 U R' U R U' R U' R2",
   "R L2 U2 L' U2 R' U' R U2 L' U L2 U2 R' L2",
   "R' U' R B2 U B2 U D' R U R U' R U' R2 D",
   "L' F2 L' F2 L' U' R U2 L' U L2 U2 R' L2",
   "L' M' B' L M U D' R2 U R' U R U' R U' R2 D"
  ]
 },
 {
  "name": "Gc-perm",
  "kind": "PLL",
  "ref": "R2 U' R U' R U R' U R2 D' U R U' R' D",
  "alts": [
   "R2 U' R U' R U R' U R2 U D' R U' R' D",
   "D R2 U' R U' R U R' U R2 U D' R U' R'",
   "R' L' U2 L U R U2 L' U' L2 U2 R' U R U2 L'",
   "R2 U' R U' R U R U D' F2 U F2 R U' R' D",
   "R2 U' R U' L M F L' M' U R2 U D' R U' R' D"
  ]
 },
 {
  "name": "Gd-perm",
  "kind": "PLL",
  "ref": "R U R' U' D R2 U' R U' R' U R' U R2 D'",
  "alts": [
   "D' R U R' U' D R2 U' R U' R' U R' U R2",
   "R F' U R' U' R F R U' R U' R' U R' U R2",
   "D' R U R' F2 U' F2 U' D R' U' R' U R' U R2",
   "D' R U R' U' D R2 U' L M F' L' M' U R' U R2",
   "R' L2 U2 L U2 R U R' U2 L U' r2 D2 R r2"
  ]
 },
 {
  "name": "Na-perm",
  "kind": "PLL",
  "ref": "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
  "alts": [
   "R U' L U2 R' U R L' U' L U2 R' U L'",
   "L U' R U2 L' U R' L U' R U2 L' U R'",
   "R U' L U2 R' U M F' r U2 R' U L'",
   "R U' L U2 R' U R L' U M' U2 L U2 r' U L'",
   "L M F' r U2 R' U R L' U' L U2 R' U L'",
   "R U' r B2 R' L r' U R L' U' L U2 R' U L'",
   "R U' L U2 R' L r' F R L' F' r U2 R' U L'",
   "R U' r B2 R' B M U' L U2 R' U L'"
  ]
 },
 {
  "name": "Sune",
  "kind": "OLL",
  "ref": "R U R' U R U2 R'",
  "alts": [
   "R' U2 R U R' U R",
   "L' U2 L U L' U L",
   "L U L' U L U2 L'",
   "R U' L' U R' U' L",
   "L' U2 L U r' F r",
   "R U' r' F R' F' r",
   "R U R' U' M' U2 R U2 r'"
  ]
 },
 {
  "name": "Antisune",
  "kind": "OLL",
  "ref": "R U2 R' U' R U' R'",
  "alts": [
   "R' U' R U' R' U2 R",
   "L' U' L U' L' U2 L",
   "L' U R U' L U R'",
   "r' F' r U' L' U2 L",
   "r' F R F' r U R'"
  ]
 },
 {
  "name": "OLL 45",
  "kind": "OLL",
  "ref": "F R U R' U' F'",
  "alts": [
   "R' F' U' F U R",
   "F' L' U' L U F",
   "r' U' F' U F r",
   "F' r' F' r U F",
   "B' R' U' R U B"
  ]
 },
 {
  "name": "OLL 44",
  "kind": "OLL",
  "ref": "F U R U' R' F'",
  "alts": [
   "R U B U' B' R'",
   "L U F' r U r' U' L'",
   "r B U B' U' r'",
   "D F U R U' R' F' D'"
  ]
 },
 {
  "name": "OLL 21",
  "kind": "OLL",
  "ref": "R U2 R' U' R U R' U' R U' R'",
  "alts": [
   "R U R' U R U' R' U R U2 R'",
   "R' U2 R U R' U' R U R' U R",
   "R' U' R U' R' U R U' R' U2 R",
   "L' U2 L U L' U' L U L' U L"
  ]
 },
 {
  "name": "OLL 22",
  "kind": "OLL",
  "ref": "R U2 R2 U' R2 U' R2 U2 R",
  "alts": [
   "R' U2 R2 U R2 U R2 U2 R'",
   "L' U2 L2 U r2 D r2 U2 L'",
   "L' U2 r2 D r2 U L2 U2 L'",
   "L' U2 L2 U L2 U L2 U2 L'",
   "R' U2 R2 U' D2 L2 U L2 D2 R'",
   "R' U2 R2 U' D2 r2 D r2 D2 R'",
   "R' U2 R2 D B2 U B2 U' D' R'",
   "F U2 F2 U' F2 U' F2 U2 F"
  ]
 },
 {
  "name": "OLL 23",
  "kind": "OLL",
  "ref": "R2 D' R U2 R' D R U2 R",
  "alts": [
   "R' U2 R F U' R' U' R U F'",
   "R' U' R U' R' U2 R2 U R' U R U2 R'",
   "R' U2 R U L U2 R' U' R U2 L'",
   "R' U2 R U' L U2 R' U R U2 L'",
   "R2 D' r U2 r' D R U2 R",
   "r2 U' R F2 R' U r F2 r",
   "r2 U' r F2 r' U r F2 r",
   "R2 D' R U2 R' D r U2 R U2 M"
  ]
 },
 {
  "name": "OLL 33",
  "kind": "OLL",
  "ref": "R U R' U' R' F R F'",
  "alts": [
   "F R U' R' U R U R' F'",
   "R U R' F' U' F R U' R'",
   "r' F' r U r U' r' F",
   "R U R' F' U L' U' L F",
   "R U R' F' U r' F' r F"
  ]
 },
 {
  "name": "OLL 24",
  "kind": "OLL",
  "ref": "r U R' U' r' F R F'",
  "alts": [
   "R U R' U' L' U R U' R' L",
   "F R F' r U R' U' r'",
   "r U R' U' L' U L M F'",
   "R' U' R F R' U R U' F'",
   "R' U' R' D' R U R' D R2",
   "r U R' U' L' U R U' L r'"
  ]
 },
 {
  "name": "OLL 25",
  "kind": "OLL",
  "ref": "F' r U R' U' r' F R",
  "alts": [
   "F' r U R' U' L' U L M",
   "R2 D R' U R D' R' U' R'",
   "R L' U' L U R' U' L' U L",
   "R U R' L' U2 R U R' U2 L",
   "F U R' U' R F' R' U R"
  ]
 },
 {
  "name": "OLL 37",
  "kind": "OLL",
  "ref": "F R' F' R U R U' R'",
  "alts": [
   "F' r U r' U' L' U L",
   "F R U' R' U' R U R' F'",
   "F' r U r' U' r' F r",
   "F R U' R' U F' L' U L",
   "F R U' R' U F' r' F r"
  ]
 },
 {
  "name": "OLL 28",
  "kind": "OLL",
  "ref": "r U R' U' M U R U' R'",
  "alts": [
   "M' U M U2 M' U M",
   "M U M' U2 M U M'",
   "r' U' R U M' U' R' U R",
   "M' U' M U2 M' U' M"
  ]
 },
 {
  "name": "OLL 57",
  "kind": "OLL",
  "ref": "R U R' U' M' U R U' r'",
  "alts": [
   "R U' R' U M U' R U R' M'",
   "R' U' R U M U' R' U r",
   "R' U R U' M' U R' U' R M",
   "R' U R U' M' U R' U' R2 r'",
   "R U R' U M U' R U' R' U2 M'",
   "F R U' R' F' r' U' F U r",
   "R U R' U' R' L F R F' L'",
   "M F' r U M' U' r' F"
  ]
 },
 {
  "name": "OLL 43",
  "kind": "OLL",
  "ref": "R' U' F' U F R",
  "alts": [
   "r' F' U' F U r",
   "R' U' F R' F' R U R",
   "F' U' L' U L F",
   "F' U' r' F r F",
   "F' L' U L F R U' R'",
   "F' r' F r F R U' R'",
   "B' U' R' U R B",
   "D R' U' F' U F R D'"
  ]
 },
 {
  "name": "OLL 51",
  "kind": "OLL",
  "ref": "F U R U' R' U R U' R' F'",
  "alts": [
   "R' U' F' U F U' F' U F R"
  ]
 },
 {
  "name": "OLL 35",
  "kind": "OLL",
  "ref": "R U2 R2 F R F' R U2 R'",
  "alts": [
   "r' F2 r2 U' r' F r' F2 r",
   "F' U' r U' r' F2 U' F' U2 F",
   "F' U2 F2 R' F' R F' U2 F",
   "R U2 R2 F R F' r U2 R' U2 M",
   "R U2 R2 F R F' L M F2 L' M'"
  ]
 },
 {
  "name": "OLL 38",
  "kind": "OLL",
  "ref": "R U R' U R U' R' U' R' F R F'",
  "alts": [
   "R' U' F' U F U2 R U R' U R",
   "F' U' F2 R U R' U' F2 U2 F",
   "F R U R2 U' F' U F R F'"
  ]
 },
 {
  "name": "OLL 46",
  "kind": "OLL",
  "ref": "R' U' R' F R F' U R",
  "alts": [
   "r' U' F R' F' R U r",
   "R' F' U' F R U' R' U2 R",
   "r' F' r' F r U' F r",
   "R' F' U L' U' L F R"
  ]
 },
 {
  "name": "OLL 52",
  "kind": "OLL",
  "ref": "R U R' U R U' B U' B' R'",
  "alts": [
   "R' U' R U' R' U F' U F R",
   "r' U' R U' R' U F' U F r",
   "R' U' F' U F' r U r' F R",
   "r' U' F' U F' r U r' F r",
   "R' U' R U' R B' R' B' r' U' r B'"
  ]
 },
 {
  "name": "F2L 1",
  "kind": "F2L",
  "ref": "U R U' R'",
  "alts": [
   "R U' R'",
   "R U2 R'"
  ]
 },
 {
  "name": "F2L 2",
  "kind": "F2L",
  "ref": "F R' F' R",
  "alts": [
   "r U R' U' M",
   "F' U F",
   "F' U2 F",
   "F' L' U L F",
   "F' r' F r F"
  ]
 },
 {
  "name": "F2L 3",
  "kind": "F2L",
  "ref": "U' R U R' U2 R U' R'",
  "alts": [
   "R U R' U' R U2 R'",
   "R U R' U2 R U' R'",
   "r U R' U' R2 r' U2 R'",
   "R U R' U R' F R F'",
   "r U R' U' R M U2 R'"
  ]
 },
 {
  "name": "F2L 4",
  "kind": "F2L",
  "ref": "R U' R' U R U' R'",
  "alts": [
   "R U' R' U2 R U2 R'",
   "R U' R' M' U R U' r'"
  ]
 },
 {
  "name": "F2L 5",
  "kind": "F2L",
  "ref": "U' R U2 R' U R U R'",
  "alts": [
   "R U R' U2 R U R'",
   "R U2 R' U R U R'",
   "R' D' R U' R' D R",
   "R' D' R U R' D R",
   "R U L U' R' U L'",
   "F' U L' U L U' F",
   "r F' r' U' r F r'",
   "F D R U R' U' D' F'"
  ]
 },
 {
  "name": "F2L 6",
  "kind": "F2L",
  "ref": "R U R' U' R U R' U' R U R'",
  "alts": [
   "R U' R' U R U' R' U R U' R'",
   "F R' F' R U' R U R'",
   "F' U L' U' L U' F",
   "R F' r U R' U' r' F",
   "F' U r' F' r U' F",
   "R U r' U r U' r' U' M'",
   "F' R U' r' F M' F",
   "L' U R2 U' L U R2"
  ]
 },
 {
  "name": "F2L 7",
  "kind": "F2L",
  "ref": "U R U2 R' U R U' R'",
  "alts": [
   "R U2 R' U R U' R'",
   "R U2 R' U2 R U2 R'",
   "R U2 R' M' U R U' r'",
   "R U2 R' M' U2 R U2 r'",
   "R2 r' U2 R' U2 r U2 R'",
   "R U2 R' r' F R F' M'"
  ]
 },
 {
  "name": "F2L 8",
  "kind": "F2L",
  "ref": "R U2 R' U' R U R'",
  "alts": [
   "R U2 r' U' R U R' M'",
   "R U' M' U' R' U' R U r'"
  ]
 },
 {
  "name": "F2L 9",
  "kind": "F2L",
  "ref": "U' F' U F",
  "alts": [
   "F R' F' R",
   "r U R' U' M",
   "F' U F",
   "F' U2 F",
   "F' L' U L F",
   "F' r' F r F",
   "M' F' U F M",
   "R B U B' R'"
  ]
 },
 {
  "name": "F2L 10",
  "kind": "F2L",
  "ref": "R U' R' U2 F' U' F",
  "alts": [
   "M' U R U' r' U' R U R'",
   "R F R U R' U' F' R'",
   "M' U2 R U R' U R U r'",
   "M U r U' r' U' r U' R'",
   "F' U2 L' U' L U' F",
   "F' r' U' F U r F",
   "R U R' F' L' U2 L F",
   "F' U R U' r' F M' F"
  ]
 }
];
