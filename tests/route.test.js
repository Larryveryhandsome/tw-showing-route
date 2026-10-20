// 執行：npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../js/route.js');

const root = path.join(__dirname, '..');
const csv = fs.readFileSync(path.join(root, 'data', 'showings.example.csv'), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), ctx);
vm.runInNewContext(fs.readFileSync(path.join(root, 'data', 'sample.js'), 'utf8'), ctx);
const CFG = ctx.window.ROUTE_CONFIG;
const recs = R.loadCSV(csv);

// 暴力法算真正最短（只在測試用，n 小）
function bruteBest(start, pts) {
  let best = Infinity;
  const go = (left, order) => {
    if (!left.length) { best = Math.min(best, R.pathLength(start, pts, order)); return; }
    left.forEach((x, i) => go(left.filter((_, j) => j !== i), order.concat(x)));
  };
  go(pts.map((_, i) => i), []);
  return best;
}

test('範本 CSV 和網頁內建示範資料一模一樣', () => {
  assert.equal(ctx.window.SAMPLE_CSV.replace(/^﻿/, ''), csv.replace(/^﻿/, ''));
});

test('範本欄位和設定檔對得上', () => {
  for (const f of CFG.tableFields) assert.ok(f in recs[0], f);
  for (const k of ['order', 'address', 'lat', 'lng', 'type']) assert.ok(CFG.fields[k] in recs[0], k);
});

test('座標：兩欄、一欄「緯度, 經度」、全形逗號、錯誤值', () => {
  assert.deepEqual(R.coordOf({ 緯度: '24.1', 經度: '120.6' }, '緯度', '經度', '座標'), { lat: 24.1, lng: 120.6 });
  assert.deepEqual(R.coordOf({ 座標: '24.1477, 120.6736' }, '緯度', '經度', '座標'), { lat: 24.1477, lng: 120.6736 });
  assert.deepEqual(R.coordOf({ 座標: '24.1，120.6' }, '緯度', '經度', '座標'), { lat: 24.1, lng: 120.6 });
  assert.equal(R.coordOf({ 緯度: '', 經度: '' }, '緯度', '經度', '座標'), null);
  assert.equal(R.coordOf({ 緯度: 'abc', 經度: '1' }, '緯度', '經度'), null);
  assert.equal(R.coordOf({ 緯度: '95', 經度: '1' }, '緯度', '經度'), null);
});

test('直線距離：台灣南北約 380 公里等級、同一點為 0', () => {
  assert.equal(R.haversine({ lat: 24, lng: 121 }, { lat: 24, lng: 121 }), 0);
  const d = R.haversine({ lat: 25.04, lng: 121.51 }, { lat: 22.62, lng: 120.30 });
  assert.ok(d > 280 && d < 320, String(d));
});

test('自動排順序（12 間以內）：和暴力法算出的最短距離相同', () => {
  const p = R.plan(recs, { start: CFG.start, optimize: true });
  const withC = recs.map(r => R.coordOf(r, '緯度', '經度', '座標')).filter(Boolean);
  const best = bruteBest(CFG.start, withC);
  assert.ok(Math.abs(p.km - best) < 1e-9, `${p.km} vs ${best}`);
});

test('隨機 8 點測 20 次：精確法永遠等於暴力法；近似法不超過最短 15%', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const start = { lat: 24, lng: 121 };
  for (let t = 0; t < 20; t++) {
    const pts = Array.from({ length: 8 }, () => ({ lat: 24 + rnd() * 0.1, lng: 121 + rnd() * 0.1 }));
    const best = bruteBest(start, pts);
    assert.ok(Math.abs(R.pathLength(start, pts, R.exactOrder(start, pts)) - best) < 1e-9);
    assert.ok(R.pathLength(start, pts, R.heuristicOrder(start, pts)) <= best * 1.15);
  }
});

test('30 間也能排（近似法），每間都剛好出現一次', () => {
  const pts = Array.from({ length: 30 }, (_, i) => ({ lat: 24 + (i * 37 % 30) / 300, lng: 121 + (i * 11 % 30) / 300 }));
  const o = R.bestOrder({ lat: 24, lng: 121 }, pts);
  assert.deepEqual([...o].sort((a, b) => a - b), pts.map((_, i) => i));
});

test('自動排順序比 CSV 原本的順序短', () => {
  const a = R.plan(recs, { start: CFG.start, optimize: true });
  const b = R.plan(recs, { start: CFG.start, optimize: false });
  assert.ok(a.km < b.km, `${a.km} vs ${b.km}`);
});

test('沒有座標的排在最後、有計數', () => {
  const p = R.plan(recs, { start: CFG.start });
  assert.equal(p.missing, 1);
  assert.equal(p.stops[p.stops.length - 1].coord, null);
  assert.deepEqual(p.stops.map(s => s.no), p.stops.map((_, i) => i + 1));
});

test('不自動排：照「順序」欄，沒填的照原本列順序', () => {
  const rows = [
    { 順序: '2', 地址: 'B', 緯度: '24.1', 經度: '120.1' },
    { 順序: '', 地址: 'C', 緯度: '24.2', 經度: '120.2' },
    { 順序: '1', 地址: 'A', 緯度: '24.3', 經度: '120.3' },
  ];
  const p = R.plan(rows, { optimize: false, start: CFG.start });
  assert.deepEqual(p.stops.map(s => s.rec.地址), ['A', 'B', 'C']);
});

test('Google 地圖連結：起點、終點、中途點，超過 9 個自動分段', () => {
  const [u] = R.googleMapsLinks({ lat: 1, lng: 2 }, [{ lat: 3, lng: 4 }, '示範路 1 號'], 'driving');
  const q = new URL(u).searchParams;
  assert.equal(q.get('api'), '1');
  assert.equal(q.get('origin'), '1,2');
  assert.equal(q.get('destination'), '示範路 1 號');
  assert.equal(q.get('waypoints'), '3,4');
  const many = Array.from({ length: 15 }, (_, i) => ({ lat: i, lng: i }));
  const links = R.googleMapsLinks({ lat: 0, lng: 0 }, many);
  assert.equal(links.length, 2);
  assert.equal(new URL(links[0]).searchParams.get('waypoints').split('|').length, 9);
  assert.equal(new URL(links[1]).searchParams.get('origin'), '9,9');
  assert.equal(new URL(links[1]).searchParams.get('destination'), '14,14');
  assert.deepEqual(R.googleMapsLinks(null, []), []);
});
