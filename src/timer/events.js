// Disciplíny WCA, které timer podporuje.
//
// result: 'time' = čas, 'moves' = počet tahů (FMC), 'multi' = vyřešeno/pokusů + čas
// (náhled zamíchání viz ui/preview.js)

export const EVENTS = [
  { id: '333', name: '3×3', result: 'time' },
  { id: '222', name: '2×2', result: 'time' },
  { id: '444', name: '4×4', result: 'time' },
  { id: '555', name: '5×5', result: 'time' },
  { id: '666', name: '6×6', result: 'time' },
  { id: '777', name: '7×7', result: 'time' },
  { id: '333oh', name: '3×3 jednoruč', result: 'time' },
  { id: '333bf', name: '3×3 naslepo', result: 'time' },
  { id: '333fm', name: '3×3 na nejmenší počet tahů', result: 'moves' },
  { id: 'clock', name: 'Clock', result: 'time' },
  { id: 'minx', name: 'Megaminx', result: 'time' },
  { id: 'pyram', name: 'Pyraminx', result: 'time' },
  { id: 'skewb', name: 'Skewb', result: 'time' },
  { id: 'sq1', name: 'Square-1', result: 'time' },
  { id: '444bf', name: '4×4 naslepo', result: 'time' },
  { id: '555bf', name: '5×5 naslepo', result: 'time' },
  { id: '333mbf', name: '3×3 multi naslepo', result: 'multi' },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
