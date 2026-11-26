import assert from 'node:assert/strict';
import test from 'node:test';
import { formatQuote, isMarketOpen } from '../src/main/quote.mjs';
import { fitBounds, fitDragBounds, getHoverLayout } from '../src/main/window-layout.mjs';

test('缩放量去掉符号，颜色与指数涨跌独立', () => {
  const quote = { price: 3210.125, changePercent: -0.5, turnoverChange: 1236000000, turnover: 998755000000 };
  assert.deepEqual(formatQuote(quote), {
    direction: 'down', price: '3210.13', percent: '-0.50%', volume: '12', volumeDirection: 'up', turnover: '9987.55 亿',
  });
  const reduced = formatQuote({ ...quote, turnoverChange: -1236000000, changePercent: 0.5 });
  assert.equal(reduced.volume, '12');
  assert.equal(reduced.volumeDirection, 'down');
  assert.equal(formatQuote({ ...quote, turnoverChange: 0 }).volume, '');
  assert.equal(formatQuote({ ...quote, changePercent: 0 }).percent, '+0.00%');
});

test('悬停面板避开屏幕边缘，并保持浮窗原位置', () => {
  const area = { x: 0, y: 0, width: 1280, height: 720 };
  const bottom = { x: 1000, y: 680, width: 170, height: 30 };
  assert.deepEqual(getHoverLayout(bottom, area), { above: true, x: 1000, y: 516, width: 170, height: 194 });
  assert.deepEqual(getHoverLayout({ ...bottom, y: 10 }, area), { above: false, x: 1000, y: 10, width: 170, height: 194 });
  assert.deepEqual(getHoverLayout({ ...bottom, y: 60 }, { ...area, height: 160 }), { above: false, x: 1000, y: 0, width: 170, height: 160 });
});

test('拖动时按显示器工作区约束四边和负坐标', () => {
  const area = { x: -1280, y: 48, width: 1280, height: 672 };
  const bar = { x: -1400, y: 25, width: 192, height: 32 };
  assert.deepEqual(fitBounds(bar, area), { ...bar, x: -1280, y: 48 });
  assert.deepEqual(fitBounds({ ...bar, x: -12, y: 705 }, area), { ...bar, x: -192, y: 688 });
  assert.deepEqual(fitBounds({ ...bar, x: -600, y: 300 }, area), { ...bar, x: -600, y: 300 });
});

test('收起时忽略原生窗口多出的高度，展开时保留完整窗口', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const bounds = { x: 20, y: 1040, width: 170, height: 48 };
  assert.deepEqual(fitDragBounds(bounds, area, true), { ...bounds, y: 1010, height: 30 });
  const expanded = { ...bounds, height: 194 };
  assert.deepEqual(fitDragBounds(expanded, area, false), { ...expanded, y: 846 });
});

test('北京时间交易时段沿用插件的边界与周末规则', () => {
  for (const [time, expected] of [
    ['2026-11-25T01:14Z', false], ['2026-11-25T01:15Z', true],
    ['2026-11-25T03:35Z', true], ['2026-11-25T03:36Z', false],
    ['2026-11-25T04:55Z', true], ['2026-11-25T07:05Z', true],
    ['2026-11-25T07:06Z', false], ['2026-11-28T02:00Z', false],
  ]) {
    assert.equal(isMarketOpen(new Date(time)), expected, time);
  }
});
