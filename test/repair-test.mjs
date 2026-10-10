import { generateBoard, solve, repairPartition, validatePartition } from '../src/board.js';
import { DEFAULTS } from '../src/settings.js';
let rep = 0, dfs = 0, none = 0, deadPositions = 0;
for (const c of [{}, { matchCount: 3 }, { faceKinds: 5 }]) for (let seed = 1; seed <= 40; seed++) {
  const S = { ...DEFAULTS, ...c, seed }; const b = generateBoard(S); const m = S.matchCount;
  const tiles = b.tiles.map(t => ({ ...t, state: 'board' }));
  const free = t => t.state === 'board' && t.coveredBy.every(j => tiles[j].state !== 'board');
  let r = seed * 99991;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 12; k++) { // 随机手动消除 12 步（任意可消同牌）
    const fr = tiles.filter(free); const byK = {};
    fr.forEach(t => (byK[t.key] = byK[t.key] || []).push(t));
    const opts = Object.values(byK).filter(a => a.length >= m || a[0].key[0] === 'T');
    if (!opts.length) break;
    const o = opts[Math.floor(rnd() * opts.length)];
    (o[0].key[0] === 'T' ? [o[0]] : o.sort(() => rnd() - .5).slice(0, m)).forEach(t => t.state = 'gone');
  }
  const p = repairPartition(tiles, b.order, m);
  if (p) rep++; else { const q = solve(tiles, m, null, +process.env.NL || 30000); if (q && validatePartition(tiles, q)) dfs++; else none++; }
}
console.log({ repairOk: rep, dfsOk: dfs, unsolved: none });
