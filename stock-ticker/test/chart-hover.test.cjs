const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

// 执行生成后的图表脚本，验证高分屏坐标、午休映射和刷新后的悬停内容。
const source = fs.readFileSync('src/components/chart-webview.ts', 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const quote = { price: 3030, changePercent: 1, prevClose: 3000, turnover: 0, prevTurnover: 0, turnoverChange: 0, predictTurnover: 0, avgTurnover60: 0,
  trends: [['11:30', 120e8, 100e8, 20e8], ['13:01', 130e8, 150e8, -20e8]],
  indexTrends: [['09:30', 3000], ['11:30', 3030], ['13:01', 2970], ['15:00', 0]] };
const script = context.exports.buildChartHtml(quote).match(/<script>([\s\S]*?)<\/script>/)[1];
const labels = [];
const colors = new Map();
const events = {};
const canvasEvents = {};
const ctx = new Proxy({}, { get: (target, key) => key === 'fillText' ? (text) => { labels.push(text); colors.set(text, target.fillStyle); } : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
const element = { textContent: '', className: '', classList: { remove() {} }, addEventListener() {} };
const canvas = { style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 10, top: 20, width: 556, height: 300 }), addEventListener: (name, fn) => { canvasEvents[name] = fn; } };
vm.runInNewContext(script, {
  acquireVsCodeApi: () => ({}),
  document: { getElementById: (id) => id === 'chart' ? canvas : id === 'chart-wrap' ? { getBoundingClientRect: () => ({ width: 556, height: 300 }) } : element },
  window: { devicePixelRatio: 2, addEventListener: (name, fn) => { events[name] = fn; } },
});
const hover = (x, y = 30) => {
  labels.length = 0;
  canvasEvents.mousemove({ clientX: x + 10, clientY: y + 20 });
};
assert.equal(typeof canvasEvents.mousemove, 'function');
hover(256);
assert.ok(labels.includes('11:30'));
assert.ok(labels.includes('指数点数: 3030.00'));
assert.ok(labels.includes('涨跌幅: +1.00%'));
assert.ok(labels.includes('两市成交额: 120亿'));
assert.equal(colors.get('较昨日同期: 放量20亿'), '#ef4444');
hover(258);
assert.ok(labels.includes('涨跌幅: -1.00%'));
assert.ok(labels.includes('两市成交额: 130亿'));
assert.equal(colors.get('较昨日同期: 缩量20亿'), '#22c55e');
hover(496);
assert.ok(labels.includes('指数点数: 2970.00'));
hover(256, 220);
assert.ok(!labels.some((text) => text.startsWith('指数点数:')));
hover(256);
labels.length = 0;
events.message({ data: { type: 'quoteUpdated', data: { indexTrends: [['11:30', 3060]] } } });
assert.ok(labels.includes('涨跌幅: +2.00%'));
events.message({ data: { type: 'quoteUpdated', data: { trends: [['11:30', 120e8, 120e8, 0]] } } });
hover(256);
assert.equal(colors.get('较昨日同期: 持平0亿'), '#888');
events.message({ data: { type: 'quoteUpdated', data: { trends: [['13:01', 130e8, 150e8, -20e8]] } } });
hover(256);
assert.ok(labels.includes('两市成交额: --'));
assert.ok(labels.includes('较昨日同期: --'));
labels.length = 0;
canvasEvents.mouseleave();
assert.ok(!labels.some((text) => text.startsWith('指数点数:')));
hover(256);
labels.length = 0;
events.message({ data: { type: 'quoteUpdated', data: { prevClose: 0 } } });
assert.ok(labels.includes('涨跌幅: --'));
events.message({ data: { type: 'quoteUpdated', data: { indexTrends: [] } } });
hover(256);
assert.ok(!labels.some((text) => text.startsWith('指数点数:')));
