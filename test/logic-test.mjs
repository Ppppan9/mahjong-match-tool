import { generateBoard, solve } from '../src/board.js';
import { DEFAULTS } from '../src/settings.js';
let ok = 0, fail = 0, fallback = 0; const t0 = Date.now();
const cfgs = [{}, { matchCount: 3 }, { layers: 6, baseCols: 9, baseRows: 11 }, { holeRate: 0.3 }, { altOffset: true, shrinkCols: 0, shrinkRows: 0, layers: 5 }, { offsetX: 0.25, offsetY: 0, gapX: 0.3 }, { customGrid: '7x9,6x8,7x9,6x8' , offsetX: 0.5}, { faceKinds: 4 }, { targetWord: 'HELLO', slotCount: 7 }];
for (const c of cfgs) for (let seed = 1; seed <= 25; seed++) {
  const S = { ...DEFAULTS, ...c, seed };
  try {
    const b = generateBoard(S);
    const tiles = b.tiles.map(t => ({ ...t, state: 'board' }));
    const plan = solve(tiles, S.matchCount);
    // 校验生成顺序本身合法
    const alive = tiles.map(() => true);
    for (const g of b.order) { for (const i of g) if (!tiles[i].coveredBy.every(j => !alive[j])) throw new Error('order invalid'); g.forEach(i => alive[i] = false); }
    if (plan) ok++; else { fallback++; }
  } catch (e) { fail++; console.log('FAIL', JSON.stringify(c), seed, e.message); }
}
console.log({ ok, solverFallbackToGenOrder: fallback, fail, ms: Date.now() - t0 });
