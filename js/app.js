/* tw-showing-route 畫面邏輯。路線計算在 route.js。 */
(function () {
  'use strict';
  const R = window.Route;
  const CFG = window.ROUTE_CONFIG || {};
  const F = Object.assign({ order: '順序', address: '地址', lat: '緯度', lng: '經度', both: '座標', type: '委託' }, CFG.fields);
  const COLORS = Object.assign({ default: '#6b7280', start: '#43a047' }, CFG.colors);
  const KEY = 'tw-showing-route:v1';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const colorOf = rec => COLORS[rec[F.type]] || COLORS.default;

  let records = [];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { saved = {}; }
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* 存不了就只用這一次 */ } };

  // ---------- 地圖 ----------
  let map = null, layer = null;
  function initMap() {
    if (!window.L) {
      $('map').hidden = true;
      $('mapMsg').hidden = false;
      $('mapMsg').textContent = '地圖載入失敗（可能沒有網路），先只顯示表格；導航連結仍可使用。';
      return;
    }
    map = L.map('map');
    L.tileLayer(CFG.tiles && CFG.tiles.url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: CFG.tiles && CFG.tiles.attribution || '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  function pin(label, color, size) {
    const s = size || 28;
    return L.divIcon({
      className: '',
      html: `<div class="pin" style="background:${esc(color)};width:${s}px;height:${s}px">${esc(label)}</div>`,
      iconSize: [s, s],
      iconAnchor: [s / 2, s / 2],
    });
  }
  function drawMap(p) {
    if (!map) return;
    layer.clearLayers();
    const start = CFG.start;
    const pts = [];
    if (start) {
      L.marker([start.lat, start.lng], { icon: pin('起', COLORS.start, 32) }).bindPopup(esc(start.name || '出發點')).addTo(layer);
      pts.push([start.lat, start.lng]);
    }
    p.stops.filter(s => s.coord).forEach(s => {
      const rec = s.rec;
      L.marker([s.coord.lat, s.coord.lng], { icon: pin(s.no, colorOf(rec)) })
        .bindPopup(`<b>${s.no}. ${esc(rec[F.address])}</b><br>${esc(rec[F.type] || '')} ${esc(rec['售價(萬)'] ? rec['售價(萬)'] + ' 萬' : '')}<br>${esc(rec['經紀人'] || '')}`)
        .addTo(layer);
      pts.push([s.coord.lat, s.coord.lng]);
    });
    if (pts.length > 1) L.polyline(pts, { color: '#2563eb', weight: 3, opacity: .7, dashArray: '6 6' }).addTo(layer);
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
    else map.setView([23.7, 121], 7);
  }

  // ---------- 表格與導航 ----------
  function where(s) {
    return s.coord || s.rec[F.address];
  }
  function render() {
    const opt = $('optimize').checked;
    const p = R.plan(records, { optimize: opt, start: CFG.start, orderField: F.order, latField: F.lat, lngField: F.lng, bothField: F.both });
    const mode = CFG.travelMode || 'driving';

    const cols = CFG.tableFields && CFG.tableFields.length ? CFG.tableFields : (records[0] ? Object.keys(records[0]).filter(k => ![F.order, F.lat, F.lng, F.both].includes(k)) : []);
    let h = '<thead><tr><th>順序</th>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '<th class="no-print">導航</th></tr></thead><tbody>';
    let prev = CFG.start || null;
    p.stops.forEach(s => {
      const link = R.googleMapsLinks(prev, [where(s)], mode)[0];
      h += `<tr><td><span class="dot" style="background:${esc(colorOf(s.rec))}"></span>${s.no}</td>` +
        cols.map(c => `<td class="${c === F.address ? 'addr' : ''}${c === F.address && !s.coord ? ' nocoord' : ''}">${esc(s.rec[c])}${c === F.address && !s.coord ? '（沒有座標）' : ''}</td>`).join('') +
        `<td class="no-print"><a href="${esc(link)}" target="_blank" rel="noopener">從上一站</a></td></tr>`;
      prev = where(s);
    });
    $('table').innerHTML = h + '</tbody>';

    const links = R.googleMapsLinks(CFG.start, p.stops.map(where), mode);
    $('navLinks').innerHTML = links.map((u, i) =>
      `<a class="primary" href="${esc(u)}" target="_blank" rel="noopener">🧭 Google 地圖導航全程${links.length > 1 ? `（第 ${i + 1} 段）` : ''}</a>`).join('');

    $('summary').textContent = `共 ${p.stops.length} 間` +
      (p.km ? `，直線距離約 ${p.km.toFixed(1)} 公里` : '') +
      (p.missing ? `，${p.missing} 間沒有座標` : '') +
      (opt ? '（已自動排順序）' : '（照 CSV 順序）');

    const types = [...new Set(records.map(r => r[F.type]).filter(Boolean))];
    $('legend').innerHTML = `<span><span class="dot" style="background:${esc(COLORS.start)}"></span>出發點</span>` +
      types.map(t => `<span><span class="dot" style="background:${esc(COLORS[t] || COLORS.default)}"></span>${esc(t)}</span>`).join('') +
      '<span>藍色虛線：建議順序（直線）</span>';

    drawMap(p);
  }

  // ---------- 資料 ----------
  function useCSV(text, label, remember) {
    records = R.loadCSV(text);
    $('dataInfo').textContent = `目前資料：${label}，共 ${records.length} 間。`;
    if (remember) { saved.csv = text; saved.label = label; store(); }
    render();
  }
  $('file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => useCSV(r.result, f.name, true);
    r.readAsText(f, 'utf-8');
  });
  $('btnSample').addEventListener('click', () => { delete saved.csv; delete saved.label; store(); useCSV(window.SAMPLE_CSV || '', '示範資料（全部是假的）', false); });
  $('btnClear').addEventListener('click', () => { delete saved.csv; delete saved.label; store(); records = []; $('dataInfo').textContent = '已清除，請重新選擇 CSV 檔。'; render(); });
  $('optimize').addEventListener('change', () => { saved.optimize = $('optimize').checked; store(); render(); });
  $('btnPrint').addEventListener('click', () => window.print());

  // ---------- 啟動 ----------
  document.title = CFG.title || '帶看行程';
  $('title').textContent = CFG.title || '帶看行程';
  if (typeof saved.optimize === 'boolean') $('optimize').checked = saved.optimize;
  initMap();
  if (saved.csv) useCSV(saved.csv, saved.label || '上次選的檔案', false);
  else useCSV(window.SAMPLE_CSV || '', '示範資料（全部是假的）', false);
})();
