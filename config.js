/*
 * tw-showing-route 設定檔
 * 用記事本打開就能改，改完存檔、重新整理網頁即可。
 */
window.ROUTE_CONFIG = {
  title: '示範不動產 集體帶看行程',

  // 出發點（通常是店面）。座標可在 Google 地圖上按右鍵，點第一行數字複製。
  start: { name: '示範不動產（出發點）', lat: 24.1477, lng: 120.6736 },

  // 欄位名稱（要和 CSV 第一列一樣）
  fields: {
    order: '順序',      // 不想自動排順序時，照這欄的數字排
    address: '地址',
    lat: '緯度',
    lng: '經度',
    both: '座標',       // 也可以只用一欄放「緯度, 經度」
    type: '委託',       // 用來決定地圖上的顏色
  },

  // 表格要顯示的欄位（照順序）；留空陣列 [] 就全部顯示
  tableFields: ['地址', '售價(萬)', '單價(萬/坪)', '委託', '建坪', '地坪', '格局', '面寬(米)', '深度(米)', '現況', '停車', '帶看方式', '經紀人', '備註'],

  // 地圖顏色：委託欄位的值 → 顏色；其他值用 default
  colors: { 專任: '#1976d2', 一般: '#d32f2f', default: '#6b7280', start: '#43a047' },

  // 導航方式：driving 開車、walking 走路、bicycling 騎腳踏車、transit 大眾運輸
  travelMode: 'driving',

  // 地圖底圖（OpenStreetMap，免費、不用金鑰）
  tiles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
};
