import type { StockQuote, BoardData } from "../services/stock-data";

/**
 * 生成分时图 Webview 的完整 HTML
 * 使用 Canvas 绘制，零外部依赖
 */
export function buildChartHtml(quote: StockQuote, board?: BoardData): string {
  const dataJson = JSON.stringify({
    price: quote.price,
    changePercent: quote.changePercent,
    changeAmount: quote.changeAmount,
    prevClose: quote.prevClose,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    turnover: quote.turnover,
    prevTurnover: quote.prevTurnover,
    trends: quote.trends,
  });
  const boardJson = board ? JSON.stringify(board) : "null";

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>上证指数 分时图</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #d4d4d4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
    user-select: none;
  }
  .container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  #header {
    padding: 12px 20px 6px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  #refresh-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, #555);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  #refresh-btn:hover { opacity: 1; }
  #refresh-btn.loading { pointer-events: none; opacity: 0.5; }
  #refresh-btn .icon { display: inline-block; transition: transform 0.4s; }
  #refresh-btn.loading .icon { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #header .name { font-size: 16px; font-weight: 600; }
  #header .price { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
  #header .change { font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .up { color: #ef4444; }
  .down { color: #22c55e; }
  .flat { color: var(--vscode-editor-foreground, #999); }
  #info-bar {
    padding: 0 20px 8px;
    display: flex;
    gap: 24px;
    font-size: 12px;
    opacity: 0.7;
    flex-shrink: 0;
  }
  #info-bar span { white-space: nowrap; }
  #chart-wrap {
    width: 100%;
    flex: 0 1 35vh;
    min-height: 180px;
    padding: 0 8px 8px;
  }
  canvas { display: block; width: 100%; height: 100%; }

  /* ── Dashboard ── */
  #dashboard {
    padding: 8px 12px 12px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    flex: 1;
    max-height: 50vh;
    overflow-y: auto;
  }
  .card {
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, #333);
    border-radius: 6px;
    padding: 8px 10px;
  }
  .card-title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .card-title .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .card-title .dot-red { background: #ef4444; }
  .card-title .dot-green { background: #22c55e; }
  .card-title .dot-gray { background: #888; }
  .card-count { font-size: 11px; opacity: 0.5; margin-left: auto; }
  .card-list { list-style: none; font-size: 12px; }
  .card-list li {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    border-bottom: 1px solid rgba(128,128,128,0.1);
  }
  .card-list li:last-child { border-bottom: none; }
  .card-list .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-list .item-pct { font-variant-numeric: tabular-nums; min-width: 60px; text-align: right; }
  .section-label {
    grid-column: 1 / -1;
    font-size: 13px;
    font-weight: 600;
    padding: 4px 0 0;
    opacity: 0.6;
  }
  .empty-msg { font-size: 11px; opacity: 0.4; text-align: center; padding: 16px 0; }
</style>
</head>
<body>
<div class="container">
  <div id="header">
    <span class="name">上证指数</span>
    <span class="price" id="price">--</span>
    <span class="change" id="change">--</span>
    <button id="refresh-btn" title="刷新数据"><span class="icon">↻</span> 刷新</button>
  </div>
  <div id="info-bar">
    <span id="info-open">开盘: --</span>
    <span id="info-high">最高: --</span>
    <span id="info-low">最低: --</span>
    <span id="info-vol">成交量: --</span>
  </div>
  <div id="chart-wrap">
    <canvas id="chart"></canvas>
  </div>
  <div id="dashboard"></div>
</div>
<script>
(function() {
  const vscode = acquireVsCodeApi();
  const q = ${dataJson};
  const board = ${boardJson};

  // ── Header ──
  const isUp = q.changePercent >= 0;
  const cls = isUp ? 'up' : q.changePercent < 0 ? 'down' : 'flat';
  const sign = isUp ? '+' : '';
  document.getElementById('price').textContent = q.price.toFixed(2);
  document.getElementById('price').className = 'price ' + cls;
  const chEl = document.getElementById('change');
  chEl.textContent = sign + q.changeAmount.toFixed(2) + '  ' + sign + q.changePercent.toFixed(2) + '%';
  chEl.className = 'change ' + cls;

  document.getElementById('info-open').textContent = '开盘: ' + q.open.toFixed(2);
  document.getElementById('info-high').textContent = '最高: ' + q.high.toFixed(2);
  document.getElementById('info-low').textContent = '最低: ' + q.low.toFixed(2);
  const turnoverYi = (q.turnover / 1e8).toFixed(2);
  let volText = '两市成交: ' + turnoverYi + ' 亿';
  if (q.prevTurnover > 0) {
    const diff = q.turnover - q.prevTurnover;
    const diffYi = (Math.abs(diff) / 1e8).toFixed(2);
    if (diff > 0) volText += ' (同时刻放量' + diffYi + '亿)';
    else if (diff < 0) volText += ' (同时刻缩量' + diffYi + '亿)';
  }
  document.getElementById('info-vol').textContent = volText;

  // ── Chart ──
  const canvas = document.getElementById('chart');
  const wrap = document.getElementById('chart-wrap');
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const r = wrap.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    draw();
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20 * dpr, right: 60 * dpr, bottom: 30 * dpr, left: 16 * dpr };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const trends = q.trends;
    if (!trends || trends.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = (14 * dpr) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无分时数据（非交易时段）', W / 2, H / 2);
      return;
    }

    const prices = trends.map(t => t[1]);
    const prevClose = q.prevClose || prices[0];

    const maxDev = Math.max(
      Math.abs(Math.max(...prices) - prevClose),
      Math.abs(Math.min(...prices) - prevClose),
      prevClose * 0.001
    ) * 1.1;
    const priceMax = prevClose + maxDev;
    const priceMin = prevClose - maxDev;

    const xOf = (i) => pad.left + (i / (prices.length - 1)) * cw;
    const yOf = (p) => pad.top + ((priceMax - p) / (priceMax - priceMin)) * ch;

    // ── 网格 ──
    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.lineWidth = dpr;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = pad.left + (cw / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ch); ctx.stroke();
    }

    // ── 昨收参考线 ──
    const yPrev = yOf(prevClose);
    ctx.strokeStyle = 'rgba(128,128,128,0.5)';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(pad.left, yPrev); ctx.lineTo(pad.left + cw, yPrev); ctx.stroke();
    ctx.setLineDash([]);

    // ── 分时线 + 渐变填充 ──
    const lastPrice = prices[prices.length - 1];
    const lineColor = lastPrice >= prevClose ? '#ef4444' : '#22c55e';
    const areaColorTop = lastPrice >= prevClose ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)';
    const areaColorBot = 'rgba(0,0,0,0)';

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, areaColorTop);
    grad.addColorStop(1, areaColorBot);
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(prices[0]));
    for (let i = 1; i < prices.length; i++) ctx.lineTo(xOf(i), yOf(prices[i]));
    ctx.lineTo(xOf(prices.length - 1), pad.top + ch);
    ctx.lineTo(xOf(0), pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(prices[0]));
    for (let i = 1; i < prices.length; i++) ctx.lineTo(xOf(i), yOf(prices[i]));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ── 当前价格点 ──
    const lastX = xOf(prices.length - 1);
    const lastY = yOf(lastPrice);
    ctx.beginPath(); ctx.arc(lastX, lastY, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = lineColor; ctx.fill();

    // ── 右侧价格标签 ──
    ctx.font = (11 * dpr) + 'px sans-serif';
    ctx.textAlign = 'left';
    const labelX = pad.left + cw + 6 * dpr;
    const labelColor = (p) => p > prevClose ? '#ef4444' : p < prevClose ? '#22c55e' : '#888';

    ctx.fillStyle = '#888';
    ctx.textBaseline = 'middle';
    ctx.fillText(prevClose.toFixed(2), labelX, yPrev);

    const hi = Math.max(...prices);
    const lo = Math.min(...prices);
    ctx.fillStyle = labelColor(hi);
    ctx.fillText(hi.toFixed(2), labelX, yOf(hi));
    ctx.fillStyle = labelColor(lo);
    ctx.fillText(lo.toFixed(2), labelX, yOf(lo));

    // ── 底部时间标签 ──
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timeY = pad.top + ch + 8 * dpr;
    const times = ['09:30', '10:30', '11:30/13:00', '14:00', '15:00'];
    for (let i = 0; i < times.length; i++) {
      const x = pad.left + (cw / 4) * i;
      ctx.fillText(times[i], x, timeY);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = labelColor(hi);
    ctx.fillText('+' + ((hi - prevClose) / prevClose * 100).toFixed(2) + '%', labelX, yOf(hi) + 14 * dpr);
    ctx.fillStyle = labelColor(lo);
    ctx.fillText(((lo - prevClose) / prevClose * 100).toFixed(2) + '%', labelX, yOf(lo) - 14 * dpr);
  }

  window.addEventListener('resize', resize);
  resize();

  // ── Dashboard ──
  function renderDashboard() {
    if (!board) return;
    const el = document.getElementById('dashboard');
    let html = '<div class="section-label">板块看板</div>';
    html += buildCard('新高板块', 'dot-red', board.sectors.newHigh);
    html += buildCard('新低板块', 'dot-green', board.sectors.newLow);
    html += buildCard('不创新低板块', 'dot-gray', board.sectors.noNewLow);
    html += '<div class="section-label">个股看板</div>';
    html += buildCard('新高个股', 'dot-red', board.stocks.newHigh);
    html += buildCard('新低个股', 'dot-green', board.stocks.newLow);
    html += buildCard('不创新低个股', 'dot-gray', board.stocks.noNewLow);
    el.innerHTML = html;
  }

  function buildCard(title, dotCls, items) {
    const maxShow = 8;
    const shown = items.slice(0, maxShow);
    let h = '<div class="card"><div class="card-title">';
    h += '<span class="dot ' + dotCls + '"></span>' + title;
    h += '<span class="card-count">' + items.length + '</span></div>';
    if (shown.length === 0) {
      h += '<div class="empty-msg">暂无</div>';
    } else {
      h += '<ul class="card-list">';
      for (const it of shown) {
        const c = it.changePercent > 0 ? 'up' : it.changePercent < 0 ? 'down' : 'flat';
        const s = it.changePercent > 0 ? '+' : '';
        h += '<li><span class="item-name" title="' + it.name + '">' + it.name + '</span>';
        h += '<span class="item-pct ' + c + '">' + s + it.changePercent.toFixed(2) + '%</span></li>';
      }
      h += '</ul>';
    }
    h += '</div>';
    return h;
  }

  renderDashboard();

  // ── 刷新按钮 ──
  const btn = document.getElementById('refresh-btn');
  btn.addEventListener('click', () => {
    btn.classList.add('loading');
    btn.querySelector('.icon').textContent = '↻';
    vscode.postMessage({ type: 'refresh' });
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'updated') {
      btn.classList.remove('loading');
      location.reload();
    }
  });
})();
</script>
</body>
</html>`;
}
