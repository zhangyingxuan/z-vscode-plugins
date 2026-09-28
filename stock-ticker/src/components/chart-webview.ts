import type { StockQuote, BoardData } from "../services/stock-data";

/**
 * 生成分时图 Webview 的完整 HTML
 * 使用 Canvas 绘制，零外部依赖
 * @param quoteUpdatedAt 指数行情更新时间戳（ms，可空）
 * @param boardUpdatedAt 看板更新时间戳（ms，可空）
 */
export function buildChartHtml(
  quote: StockQuote,
  board?: BoardData,
  quoteUpdatedAt?: number,
  boardUpdatedAt?: number,
): string {
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
    turnoverChange: quote.turnoverChange,
    predictTurnover: quote.predictTurnover,
    avgTurnover5: quote.avgTurnover5,
    avgTurnover60: quote.avgTurnover60,
    trends: quote.trends,
    indexTrends: quote.indexTrends,
  });
  const boardJson = board ? JSON.stringify(board) : "null";
  const quoteTimeJson = JSON.stringify(quoteUpdatedAt ?? null);
  const boardTimeJson = JSON.stringify(boardUpdatedAt ?? null);

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>分时图</title>
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
    /* 响应式：按可用宽度自动排布列数（每列 ≥200px），越宽显示越多列表 */
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    align-content: start;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  #dashboard-header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0 0;
  }
  #dashboard-header .section-title {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.6;
  }
  #dashboard-header .dash-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dash-time { font-size: 11px; opacity: 0.5; white-space: nowrap; }
  #manage-queries-btn,
  #board-refresh-btn {
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, #555);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  #manage-queries-btn:hover,
  #board-refresh-btn:hover { opacity: 1; }
  #board-refresh-btn.loading { pointer-events: none; opacity: 0.4; }
  #board-refresh-btn .icon { display: inline-block; transition: transform 0.4s; }
  #board-refresh-btn.loading .icon { animation: spin 0.8s linear infinite; }
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
  .card-title .dot-blue { background: #3b82f6; }
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
    <span id="info-updated">更新时间: --</span>
    <button id="refresh-btn" title="刷新数据"><span class="icon">↻</span> 刷新</button>
  </div>
  <div id="info-bar">
    <span id="info-turnover">当日成交额: --</span>
    <span id="info-pre">昨日成交额: --</span>
    <span id="info-change">较昨日变动: --</span>
    <span id="info-predict">预测全天: --</span>
    <span id="info-avg">近60日均额: --</span>
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
  const board = ${boardJson} || { sectors: { newHigh: [], newLow: [] }, stocks: { newHigh: [], newLow: [] }, custom: [] };
  let quoteUpdatedAt = ${quoteTimeJson};
  let boardUpdatedAt = ${boardTimeJson};

  // ── 时间格式化：HH:MM:SS ──
  function fmtTime(t) {
    if (!t) return '--';
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // ── 更新 Header 信息 ──
  function fmtYi(v) { return (v / 1e8).toFixed(0) + '亿'; }

  function updateHeader() {
    const sign = q.changePercent >= 0 ? '+' : '';
    const cls = q.changePercent > 0 ? 'up' : q.changePercent < 0 ? 'down' : 'flat';
    document.getElementById('price').textContent = q.price.toFixed(2);
    document.getElementById('price').className = 'price ' + cls;
    const chEl = document.getElementById('change');
    chEl.textContent = sign + q.changePercent.toFixed(2) + '%';
    chEl.className = 'change ' + cls;

    document.getElementById('info-turnover').textContent = '当日成交额: ' + fmtYi(q.turnover);
    document.getElementById('info-pre').textContent = '昨日成交额: ' + fmtYi(q.prevTurnover);
    document.getElementById('info-change').textContent = '较昨日' + (q.turnoverChange > 0 ? '+' : q.turnoverChange < 0 ? '-' : '=') + ' ' + fmtYi(q.turnoverChange);
    document.getElementById('info-predict').textContent = '预测全天: ' + fmtYi(q.predictTurnover);
    document.getElementById('info-avg').textContent = '近60日均额: ' + fmtYi(q.avgTurnover60);
  }

  // ── Header ──
  updateHeader();
  document.getElementById('info-updated').textContent = '更新时间: ' + fmtTime(quoteUpdatedAt);

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

    const pad = { top: 16 * dpr, right: 60 * dpr, bottom: 30 * dpr, left: 16 * dpr };
    const cw = W - pad.left - pad.right;
    const chTotal = H - pad.top - pad.bottom;
    // 上：指数点位分时线；下：成交额分时（当日/昨日）
    const splitRatio = 0.62;
    const chIndex = chTotal * splitRatio;
    const chTurn = chTotal - chIndex - 26 * dpr;

    const indexTrends = q.indexTrends || [];
    const trends = q.trends || [];

    const times = ['09:30', '10:30', '11:30/13:00', '14:00', '15:00'];
    const timeX = (i) => pad.left + (cw / 4) * i;

    // ── 网格（共用横坐标）──
    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.lineWidth = dpr;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chIndex / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(timeX(i), pad.top); ctx.lineTo(timeX(i), pad.top + chTotal); ctx.stroke();
    }

    // 实际 X 映射：共用全天时间槽（以成交额分时的时间序列为准），
    // 指数/成交额各点按 "HH:MM" 对齐到槽位，盘中数据不会错位占满全宽
    const timeSlots = trends.map(t => t[0]);
    const xOfSlot = (slot) => timeSlots.length <= 1 ? pad.left + cw / 2 : pad.left + (slot / (timeSlots.length - 1)) * cw;
    const xOfIdx = (t) => {
      const slot = timeSlots.indexOf(t[0]);
      return slot === -1 ? xOfSlot(Math.max(0, timeSlots.length - 1)) : xOfSlot(slot);
    };
    const xOfTurn = (n) => xOfSlot(n);

    // ── 上部：上证指数点位分时线 ──
    const drawPoly = (xOfFn, pts, strokeStyle, fillTop, yTop, yBot, vMin, vMax) => {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      let lastN = 0, lastY = 0;
      for (let n = 0; n < pts.length; n++) {
        const v = pts[n][1];
        if (!(v > 0)) continue;
        const x = xOfFn(pts[n]);
        const y = yTop + (1 - (v - vMin) / (vMax - vMin)) * (yBot - yTop);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
        lastN = n; lastY = y;
      }
      if (!started) return;
      // 渐变填充
      const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
      grad.addColorStop(0, fillTop);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.lineTo(xOfFn(pts[lastN]), yBot);
      ctx.lineTo(xOfFn(pts[pts.findIndex(p => p[1] > 0)]), yBot);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      // 描边
      ctx.beginPath();
      started = false;
      for (let n = 0; n < pts.length; n++) {
        const v = pts[n][1];
        if (!(v > 0)) continue;
        const y = yTop + (1 - (v - vMin) / (vMax - vMin)) * (yBot - yTop);
        if (!started) { ctx.moveTo(xOfFn(pts[n]), y); started = true; }
        else ctx.lineTo(xOfFn(pts[n]), y);
      }
      ctx.stroke();
      // 当前点
      ctx.beginPath(); ctx.arc(xOfFn(pts[lastN]), lastY, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = strokeStyle; ctx.fill();
    };

    // 指数面板
    if (indexTrends.length > 0) {
      const idxPrices = indexTrends.map(t => t[1]).filter(v => v > 0);
      const prevClose = q.prevClose || idxPrices[0];
      const maxDev = Math.max(
        Math.abs(Math.max(...idxPrices) - prevClose),
        Math.abs(Math.min(...idxPrices) - prevClose),
        prevClose * 0.001
      ) * 1.1;
      const vMax = prevClose + maxDev;
      const vMin = prevClose - maxDev;
      const yTop = pad.top, yBot = pad.top + chIndex;
      const pts = indexTrends;

      // 昨收参考线
      const yPrev = yTop + (1 - (prevClose - vMin) / (vMax - vMin)) * (yBot - yTop);
      ctx.strokeStyle = 'rgba(128,128,128,0.5)';
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(pad.left, yPrev); ctx.lineTo(pad.left + cw, yPrev); ctx.stroke();
      ctx.setLineDash([]);

      const last = idxPrices[idxPrices.length - 1];
      const lineColor = last >= prevClose ? '#ef4444' : '#22c55e';
      const fillTop = last >= prevClose ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)';
      drawPoly(xOfIdx, pts, lineColor, fillTop, yTop, yBot, vMin, vMax);

      // 右侧指数标签
      ctx.font = (11 * dpr) + 'px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888';
      ctx.fillText(prevClose.toFixed(2), pad.left + cw + 6 * dpr, yPrev);
      ctx.fillStyle = lineColor;
      const hi = Math.max(...idxPrices), lo = Math.min(...idxPrices);
      const yHi = yTop + (1 - (hi - vMin) / (vMax - vMin)) * (yBot - yTop);
      const yLo = yTop + (1 - (lo - vMin) / (vMax - vMin)) * (yBot - yTop);
      ctx.fillText(hi.toFixed(2), pad.left + cw + 6 * dpr, yHi);
      ctx.fillStyle = lineColor === '#ef4444' ? '#22c55e' : '#ef4444';
      ctx.fillText(lo.toFixed(2), pad.left + cw + 6 * dpr, yLo);
    } else {
      ctx.fillStyle = '#888';
      ctx.font = (13 * dpr) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无指数分时数据', pad.left + cw / 2, pad.top + chIndex / 2);
    }

    // ── 分隔线 ──
    const turnTop = pad.top + chIndex + 26 * dpr;
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    ctx.beginPath(); ctx.moveTo(pad.left, turnTop - 12 * dpr); ctx.lineTo(pad.left + cw, turnTop - 12 * dpr); ctx.stroke();

    // ── 下部：成交额分时（当日/昨日累计）──
    if (trends.length > 0) {
      const today = trends.map(t => t[1]);
      const yest = trends.map(t => t[2]);
      const vMaxT = Math.max(...today.filter(v => v > 0), ...yest.filter(v => v > 0), 1) * 1.1;
      const vMinT = 0;
      const yTopT = turnTop, yBotT = turnTop + chTurn;
      const yOfT = (v) => yTopT + (1 - (v - vMinT) / (vMaxT - vMinT)) * (yBotT - yTopT);

      const drawTurn = (series, strokeStyle, dash) => {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1.5 * dpr;
        ctx.lineJoin = 'round';
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        let started = false;
        for (let n = 0; n < series.length; n++) {
          const v = series[n];
          if (!(v > 0)) continue;
          if (!started) { ctx.moveTo(xOfTurn(n), yOfT(v)); started = true; }
          else ctx.lineTo(xOfTurn(n), yOfT(v));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };

      drawTurn(yest, 'rgba(148,148,148,0.6)', [4 * dpr, 4 * dpr]);
      const lastToday = today.filter(v => v > 0).pop() ?? 0;
      const lastYest = yest.filter(v => v > 0).pop() ?? 0;
      const c = lastToday >= lastYest ? '#ef4444' : '#22c55e';
      drawTurn(today, c, null);

      // 右侧成交额标签（亿）
      ctx.font = (11 * dpr) + 'px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888';
      ctx.fillText((vMaxT / 1e8).toFixed(0) + '亿', pad.left + cw + 6 * dpr, yTopT);
      ctx.fillText('0', pad.left + cw + 6 * dpr, yBotT);
    } else {
      ctx.fillStyle = '#888';
      ctx.font = (12 * dpr) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无成交额数据', pad.left + cw / 2, (turnTop + (turnTop + chTurn)) / 2);
    }

    // ── 底部时间标签 ──
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timeY = pad.top + chTotal + 8 * dpr;
    for (let i = 0; i < times.length; i++) {
      ctx.fillText(times[i], timeX(i), timeY);
    }
  }

  window.addEventListener('resize', resize);
  resize();

  // ── Dashboard ──
  function renderDashboard() {
    if (!board) return;
    const el = document.getElementById('dashboard');
    let html = '<div id="dashboard-header">';
    html += '<span class="section-title">新高 / 新低看板</span>';
    html += '<span class="dash-actions">';
    html += '<span id="board-updated" class="dash-time">看板更新: ' + fmtTime(boardUpdatedAt) + '</span>';
    html += '<button id="manage-queries-btn" title="管理爱问财问答语句">问句管理</button>';
    html += '<button id="board-refresh-btn" title="刷新看板"><span class="icon">↻</span> 刷新看板</button>';
    html += '</span>';
    html += '</div>';
    html += '<div class="section-label">板块</div>';
    html += buildCard('新高板块', 'dot-red', board.sectors.newHigh);
    html += buildCard('新低板块', 'dot-green', board.sectors.newLow);
    html += '<div class="section-label">个股</div>';
    html += buildCard('新高个股', 'dot-red', board.stocks.newHigh);
    html += buildCard('新低个股', 'dot-green', board.stocks.newLow);
    // 用户自定义看板
    if (Array.isArray(board.custom)) {
      for (const cb of board.custom) {
        html += buildCard(cb.title || '自定义', 'dot-blue', cb.items);
      }
    }
    el.innerHTML = html;

    // 绑定看板刷新按钮
    const boardBtn = document.getElementById('board-refresh-btn');
    if (boardBtn) {
      boardBtn.addEventListener('click', () => {
        boardBtn.classList.add('loading');
        vscode.postMessage({ type: 'refreshBoard' });
      });
    }
    // 绑定问句管理按钮
    const manageBtn = document.getElementById('manage-queries-btn');
    if (manageBtn) {
      manageBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'manageQueries' });
      });
    }
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function buildCard(title, dotCls, items) {
    const maxShow = 8;
    const shown = items.slice(0, maxShow);
    let h = '<div class="card"><div class="card-title">';
    h += '<span class="dot ' + dotCls + '"></span>' + escapeHtml(title);
    h += '<span class="card-count">' + items.length + '</span></div>';
    if (shown.length === 0) {
      h += '<div class="empty-msg">暂无</div>';
    } else {
      h += '<ul class="card-list">';
      for (const it of shown) {
        const c = it.changePercent > 0 ? 'up' : it.changePercent < 0 ? 'down' : 'flat';
        const s = it.changePercent > 0 ? '+' : '';
        h += '<li><span class="item-name" title="' + escapeHtml(it.name) + '">' + escapeHtml(it.name) + '</span>';
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

  // ── 消息监听：增量更新数据 ──
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'quoteUpdated') {
      // 更新行情数据
      Object.assign(q, msg.data);
      if (msg.updatedAt) quoteUpdatedAt = msg.updatedAt;
      updateHeader();
      document.getElementById('info-updated').textContent = '更新时间: ' + fmtTime(quoteUpdatedAt);
      draw();
      btn.classList.remove('loading');
    } else if (msg.type === 'boardUpdated') {
      // 更新板块数据
      Object.assign(board, msg.data);
      if (msg.updatedAt) boardUpdatedAt = msg.updatedAt;
      renderDashboard();
      const topBtn = document.getElementById('refresh-btn');
      if (topBtn) topBtn.classList.remove('loading');
    }
  });
})();
</script>
</body>
</html>`;
}
