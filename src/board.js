// 棋盘生成（保证有解）与求解器
import { faceCatalog } from './faces.js';

export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const shuffle = (arr, rnd) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

export function layerGrids(S) {
  const custom = (S.customGrid || '').trim();
  if (custom) {
    const g = custom.split(/[,，;\s]+/).map(s => s.match(/(\d+)\s*[x×*]\s*(\d+)/i)).filter(Boolean).map(m => [+m[1], +m[2]]);
    if (g.length) return g.slice(0, 12);
  }
  const out = [];
  for (let i = 0; i < S.layers; i++) {
    const c = S.baseCols - i * S.shrinkCols, r = S.baseRows - i * S.shrinkRows;
    if (c < 1 || r < 1) break;
    out.push([c, r]);
  }
  return out;
}

export function generateBoard(S) {
  const rnd = mulberry32((S.seed >>> 0) || 1);
  const tw = 1, th = S.tileRatio;
  const px = tw * (1 + S.gapX), py = th + tw * S.gapY;
  const grids = layerGrids(S);
  const c0 = grids[0][0], r0 = grids[0][1];
  let pos = [];
  grids.forEach(([cols, rows], L) => {
    const k = S.altOffset ? (L % 2) : L;
    const ox = -(c0 - 1) / 2 * px + k * S.offsetX * px;
    const oy = (r0 - 1) / 2 * py - k * S.offsetY * py; // y 向上为正，行从上往下
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (L > 0 && S.holeRate > 0 && rnd() < S.holeRate) continue;
      pos.push({ layer: L, col: c, row: r, x: ox + c * px + (r % 2) * (S.rowStagger || 0) * px, y: oy - r * py });
    }
  });
  const overlap = (a, b) => Math.abs(a.x - b.x) < tw * 0.97 && Math.abs(a.y - b.y) < th * 0.97;
  // 去掉悬空的牌（上层必须压在下层某张牌上）
  pos.sort((a, b) => a.layer - b.layer);
  const kept = [];
  for (const p of pos) {
    if (p.layer === 0 || kept.some(q => q.layer === p.layer - 1 && overlap(p, q))) kept.push(p);
  }
  pos = kept;
  const m = S.matchCount;
  let word = (S.targetWord || '').toUpperCase().replace(/\s/g, '').slice(0, S.slotCount);
  const letterPairs = S.letterMode !== 'single' && S.trayMode !== 'tray';
  let L = letterPairs ? 0 : word.length; // 单张字母数量（成对模式下字母作为普通配对组）
  const coverOf = () => pos.map((p, i) => pos.map((q, j) => (q.layer > p.layer && overlap(p, q)) ? j : -1).filter(j => j >= 0));
  // 调整数量：(n-L) % m == 0，从未被压的最高层牌里删
  let guard = 0;
  while (pos.length > 0 && ((pos.length - L) % m !== 0 || pos.length - L < m) && guard++ < 100) {
    if (pos.length - L < m) { if (!letterPairs) { word = word.slice(0, Math.max(0, pos.length % m)); L = word.length; } if ((pos.length - L) % m === 0 && pos.length - L >= m) break; if (pos.length < m) break; }
    const cov = pos.map((p, i) => pos.some((q, j) => j !== i && q.layer < p.layer && overlap(p, q)) || p.layer === 0);
    const tops = pos.map((p, i) => i).filter(i => !pos.some((q, j) => q.layer > pos[i].layer && overlap(pos[i], q)));
    tops.sort((a, b) => pos[b].layer - pos[a].layer || rnd() - 0.5);
    pos.splice(tops[0], 1);
  }
  const n = pos.length;
  const coveredBy = coverOf();
  // 牌面种类
  const sets = faceCatalog(S).map(s => shuffle(s.slice(), rnd));
  const kinds = [];
  let si = 0;
  const total = sets.reduce((a, s) => a + s.length, 0);
  while (kinds.length < Math.min(S.faceKinds, total)) { const s = sets[si % sets.length]; if (s.length) kinds.push(s.shift()); si++; }
  const G = (n - L) / m;
  if (letterPairs && word.length > G) word = word.slice(0, G);
  const LG = letterPairs ? word.length : 0;
  const keyList = [];
  for (let g = 0; g < G - LG; g++) keyList.push(kinds[g % kinds.length]);
  shuffle(keyList, rnd);
  // 成对字母：按“靠前程度”插入到拆解顺序前段（越靠前越在上层、越早可见）
  for (let i = 0; i < LG; i++) {
    const pos2 = Math.floor(rnd() * Math.max(1, (keyList.length + 1) * S.letterEarly));
    keyList.splice(Math.min(pos2, keyList.length), 0, 'T' + word[i] + ':' + i);
  }

  for (let attempt = 0; attempt < 80; attempt++) {
    const r2 = mulberry32(((S.seed >>> 0) || 1) + attempt * 7919);
    const keys = new Array(n).fill(null);
    const alive = new Array(n).fill(true);
    let aliveCount = n;
    const order = [];
    const totalSteps = G + L;
    const letterSteps = [];
    for (let i = 0; i < L; i++) letterSteps.push(Math.floor(r2() * Math.max(1, totalSteps * S.letterEarly)));
    letterSteps.sort((a, b) => a - b);
    const letterIdx = shuffle([...Array(L).keys()], r2);
    let li = 0, gi = 0, step = 0, ok = true;
    const freeList = () => { const f = []; for (let i = 0; i < n; i++) if (alive[i] && coveredBy[i].every(j => !alive[j])) f.push(i); return f; };
    while (aliveCount > 0) {
      let free = freeList();
      while (li < L && (letterSteps[li] <= step || aliveCount === L - li) && free.length) {
        // 字母优先放在较高层
        free.sort((a, b) => pos[b].layer - pos[a].layer + (r2() - 0.5) * 1.5);
        const t = free[0];
        keys[t] = 'T' + word[letterIdx[li]] + ':' + letterIdx[li];
        alive[t] = false; aliveCount--; order.push([t]); li++;
        free = freeList();
      }
      if (aliveCount === 0) break;
      if (free.length < m || gi >= G) {
        if (li < L && free.length) { letterSteps[li] = step; continue; }
        ok = false; break;
      }
      shuffle(free, r2);
      const grp = free.slice(0, m);
      for (const t of grp) { keys[t] = keyList[gi]; alive[t] = false; aliveCount--; }
      order.push(grp); gi++; step++;
    }
    if (ok && keys.every(k => k)) {
      return { tiles: pos.map((p, i) => ({ id: i, ...p, key: keys[i], coveredBy: coveredBy[i] })), word, order, tw, th, letterPairs };
    }
  }
  throw new Error('棋盘生成失败，请调整参数');
}

export const isTarget = k => k[0] === 'T';
export const targetIndex = k => +k.split(':')[1];
export const targetChar = k => k[1];

// 求解：tiles[i].state: 'board'|'selected'|'tray'|'gone'
// 返回步骤数组 [[id,...],...]；字母为单张步骤
// goal(alive) 可选：返回 true 即视为完成（例如“目标字母已全部消除”），用于集齐单词即通关的模式
export function solve(tiles, m, startPos, nodeLimit = 30000, goal = null) {
  const n = tiles.length;
  const covers = tiles.map(() => []);
  tiles.forEach((t, i) => t.coveredBy.forEach(j => covers[j].push(i)));
  const alive = tiles.map(t => t.state === 'board' || t.state === 'selected' || t.state === 'tray');
  const onBoard = tiles.map(t => t.state === 'board' || t.state === 'selected');
  const isFree = i => alive[i] && (!onBoard[i] || tiles[i].coveredBy.every(j => !alive[j] || !onBoard[j]));
  const plan = [];
  const seen = new Set();
  let nodes = 0;
  let last = startPos || { x: 0, y: 0 };
  const dist = (grp, p) => { let s = 0; for (const i of grp) s += Math.hypot(tiles[i].x - p.x, tiles[i].y - p.y); return s / grp.length; };
  const remainCount = () => alive.reduce((a, v) => a + (v ? 1 : 0), 0);
  const keyCount = new Map();
  tiles.forEach(t => keyCount.set(t.key, (keyCount.get(t.key) || 0) + 1));
  const single = i => isTarget(tiles[i].key) && keyCount.get(tiles[i].key) === 1;
  function rec(p) {
    if (++nodes > nodeLimit) return false;
    // 免费拿取所有可拿的目标字母（总是安全的）
    const takenLetters = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) if (alive[i] && single(i) && isFree(i)) { alive[i] = false; takenLetters.push(i); changed = true; }
    }
    const undoLetters = () => { for (const i of takenLetters) alive[i] = true; };
    if (remainCount() === 0 || (goal && goal(alive))) { for (const i of takenLetters) plan.push([i]); return true; }
    const sig = alive.map(v => v ? 1 : 0).join('');
    if (seen.has(sig)) { undoLetters(); return false; }
    seen.add(sig);
    const byKey = new Map(), totalKey = new Map();
    for (let i = 0; i < n; i++) if (alive[i]) {
      const k = tiles[i].key; totalKey.set(k, (totalKey.get(k) || 0) + 1);
      if (isFree(i)) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); }
    }
    let cands = [];
    for (const [k, list] of byKey) {
      if (list.length < m) continue;
      const tot = totalKey.get(k);
      if (list.length === tot) { // 安全：全部同类牌都可拿
        cands = [{ grp: list.slice(0, m), safe: true }]; break;
      }
      // 组合（数量有限）
      const combos = [];
      const pick = (start, cur) => { if (combos.length > 12) return; if (cur.length === m) { combos.push(cur.slice()); return; } for (let s = start; s < list.length; s++) { cur.push(list[s]); pick(s + 1, cur); cur.pop(); } };
      pick(0, []);
      for (const c of combos) cands.push({ grp: c });
    }
    if (!cands.length) { undoLetters(); return false; }
    // 启发：解放更多牌 + 离上一步近
    const score = c => {
      let freed = 0;
      for (const i of c.grp) for (const j of covers[i]) if (alive[j]) freed++;
      return (c.safe ? 1000 : 0) + freed * 2 - dist(c.grp, p) * 0.35 + Math.random() * 0.8;
    };
    cands.forEach(c => c.s = score(c));
    cands.sort((a, b) => b.s - a.s);
    for (const c of cands.slice(0, 6)) {
      for (const i of c.grp) alive[i] = false;
      const pl = plan.length;
      for (const i of takenLetters) plan.push([i]);
      plan.push(c.grp);
      const np = { x: tiles[c.grp[c.grp.length - 1]].x, y: tiles[c.grp[c.grp.length - 1]].y };
      if (rec(np)) return true;
      plan.length = pl;
      for (const i of c.grp) alive[i] = true;
    }
    undoLetters();
    return false;
  }
  const ok = rec(last);
  return ok ? plan : null;
}

const isAlive = t => t.state === 'board' || t.state === 'selected' || t.state === 'tray';
// 校验一个分组方案（每组同牌）是否存在合法消除顺序：每次找任意可消组即可（不会死锁则合法）
export function validatePartition(tiles, groups) {
  const alive = tiles.map(isAlive);
  const onB = tiles.map(t => t.state === 'board' || t.state === 'selected');
  const free = i => !onB[i] || tiles[i].coveredBy.every(j => !alive[j] || !onB[j]);
  let rest = groups.slice();
  while (rest.length) {
    const k = rest.findIndex(g => g.every(free));
    if (k < 0) return false;
    rest[k].forEach(i => alive[i] = false);
    rest.splice(k, 1);
  }
  return true;
}
// 根据生成时的分组修复出当前局面的分组（手动操作打乱了部分组时，把剩余同牌按原顺序重新组队）
export function repairPartition(tiles, order, m) {
  const groups = [], left = new Map();
  order.forEach((g, gi) => {
    const al = g.filter(i => isAlive(tiles[i]));
    if (al.length === g.length) groups.push({ ids: g.slice(), gi });
    else al.forEach(id => { const k = tiles[id].key; if (!left.has(k)) left.set(k, []); left.get(k).push({ id, gi }); });
  });
  for (const [, arr] of left) {
    if (arr.length % m) return null;
    arr.sort((a, b) => a.gi - b.gi);
    for (let i = 0; i < arr.length; i += m) { const ch = arr.slice(i, i + m); groups.push({ ids: ch.map(x => x.id), gi: ch[ch.length - 1].gi + 0.5 }); }
  }
  groups.sort((a, b) => a.gi - b.gi);
  const res = groups.map(g => g.ids);
  return validatePartition(tiles, res) ? res : null;
}
