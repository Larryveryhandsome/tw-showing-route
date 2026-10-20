/*
 * tw-showing-route 路線核心（純函式，不碰畫面）
 * 瀏覽器：window.Route；Node：require('./route.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Route = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- CSV ----------
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ''));
  }
  function loadCSV(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }

  // ---------- 座標 ----------
  /** 讀座標：支援分開兩欄，或一欄「緯度, 經度」（Google 地圖右鍵複製的格式） */
  function coordOf(rec, latField, lngField, bothField) {
    let lat, lng;
    if (bothField && rec[bothField]) {
      const m = String(rec[bothField]).match(/(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)/);
      if (m) { lat = +m[1]; lng = +m[2]; }
    }
    if (lat == null && rec[latField] !== undefined && rec[lngField] !== undefined && rec[latField] !== '' && rec[lngField] !== '') {
      lat = Number(rec[latField]);
      lng = Number(rec[lngField]);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  /** 兩點直線距離（公里） */
  function haversine(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** 從起點出發依序走完的總距離（公里，不含回程） */
  function pathLength(start, pts, order) {
    let d = 0, cur = start;
    for (const i of order) { d += haversine(cur, pts[i]); cur = pts[i]; }
    return d;
  }

  /** 12 間以內：Held-Karp 動態規劃，保證是最短的順序（起點固定、不回程） */
  function exactOrder(start, pts) {
    const n = pts.length, FULL = 1 << n;
    const d = pts.map(a => pts.map(b => haversine(a, b)));
    const dp = Array.from({ length: FULL }, () => new Float64Array(n).fill(Infinity));
    const par = Array.from({ length: FULL }, () => new Int8Array(n).fill(-1));
    for (let i = 0; i < n; i++) dp[1 << i][i] = haversine(start, pts[i]);
    for (let m = 1; m < FULL; m++) {
      for (let i = 0; i < n; i++) {
        const cur = dp[m][i];
        if (cur === Infinity || !(m & (1 << i))) continue;
        for (let j = 0; j < n; j++) {
          if (m & (1 << j)) continue;
          const nm = m | (1 << j), v = cur + d[i][j];
          if (v < dp[nm][j] - 1e-12) { dp[nm][j] = v; par[nm][j] = i; }
        }
      }
    }
    let last = 0;
    for (let i = 1; i < n; i++) if (dp[FULL - 1][i] < dp[FULL - 1][last] - 1e-12) last = i;
    const order = [];
    for (let m = FULL - 1, i = last; i !== -1;) { order.push(i); const p = par[m][i]; m ^= 1 << i; i = p; }
    return order.reverse();
  }

  /** 超過 12 間：每次走最近的下一間，再用 2-opt（拉直交叉）和 or-opt（搬動單點）改善 */
  function heuristicOrder(start, pts) {
    const n = pts.length;
    const left = new Set(pts.map((_, i) => i));
    let order = [];
    let cur = start;
    while (left.size) {
      let best = -1, bd = Infinity;
      for (const i of left) {
        const dd = haversine(cur, pts[i]);
        if (dd < bd - 1e-12) { bd = dd; best = i; }
      }
      order.push(best);
      left.delete(best);
      cur = pts[best];
    }
    let len = pathLength(start, pts, order);
    const tryOrder = cand => {
      const l = pathLength(start, pts, cand);
      if (l < len - 1e-9) { order = cand; len = l; return true; }
      return false;
    };
    let improved = true, guard = 0;
    while (improved && guard++ < 100) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        for (let k = i + 1; k < n; k++) {
          if (tryOrder(order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1)))) improved = true;
        }
      }
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const c = order.slice();
          const [x] = c.splice(i, 1);
          c.splice(j, 0, x);
          if (tryOrder(c)) improved = true;
        }
      }
    }
    return order;
  }

  /**
   * 排出最順的順序（起點固定、走完最後一間就結束，不算回程）。
   * 12 間以內保證最短；超過 12 間用快速近似法。
   * @returns {number[]} pts 的索引順序
   */
  function bestOrder(start, pts) {
    if (pts.length <= 1) return pts.map((_, i) => i);
    return pts.length <= 12 ? exactOrder(start, pts) : heuristicOrder(start, pts);
  }

  /**
   * 整理行程：有座標的照最順順序（或 CSV 的順序欄），沒座標的排最後。
   * @returns {{stops: object[], km: number, missing: number}}
   *   stops[i] = { no, rec, coord|null }
   */
  function plan(records, opts) {
    const o = Object.assign({ optimize: true, orderField: '順序', latField: '緯度', lngField: '經度', bothField: '座標' }, opts || {});
    const items = records.map(rec => ({ rec, coord: coordOf(rec, o.latField, o.lngField, o.bothField) }));
    const withC = items.filter(x => x.coord);
    const without = items.filter(x => !x.coord);
    let ordered;
    if (o.optimize && o.start && withC.length) {
      ordered = bestOrder(o.start, withC.map(x => x.coord)).map(i => withC[i]);
    } else {
      // 照 CSV 的「順序」欄；沒填的照原本列的順序
      const key = x => { const v = parseFloat(x.rec[o.orderField]); return Number.isFinite(v) ? v : Infinity; };
      ordered = withC.map((x, i) => ({ x, i })).sort((a, b) => (key(a.x) - key(b.x)) || (a.i - b.i)).map(y => y.x);
    }
    const all = ordered.concat(without);
    const km = o.start && ordered.length ? pathLength(o.start, ordered.map(x => x.coord), ordered.map((_, i) => i)) : 0;
    return { stops: all.map((x, i) => ({ no: i + 1, rec: x.rec, coord: x.coord })), km, missing: without.length };
  }

  // ---------- Google 地圖導航連結 ----------
  const place = p => (p && typeof p === 'object' && 'lat' in p ? `${p.lat},${p.lng}` : String(p || ''));
  /**
   * 產生 Google 地圖導航網址（開啟即可導航，不需要 API 金鑰）。
   * Google 規定中途點最多 9 個，超過會自動切成好幾段。
   * @returns {string[]} 網址陣列
   */
  function googleMapsLinks(origin, stops, mode, maxWaypoints) {
    const max = maxWaypoints || 9;
    const pts = stops.map(place).filter(Boolean);
    const links = [];
    let from = place(origin);
    for (let i = 0; i < pts.length; i += max + 1) {
      const seg = pts.slice(i, i + max + 1);
      const dest = seg[seg.length - 1];
      const way = seg.slice(0, -1);
      const u = new URLSearchParams({ api: '1', destination: dest, travelmode: mode || 'driving' });
      if (from) u.set('origin', from);
      if (way.length) u.set('waypoints', way.join('|'));
      links.push('https://www.google.com/maps/dir/?' + u.toString());
      from = dest;
    }
    return links;
  }

  return { parseCSV, loadCSV, coordOf, haversine, pathLength, exactOrder, heuristicOrder, bestOrder, plan, googleMapsLinks };
});
