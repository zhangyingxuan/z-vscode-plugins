const assert = require('node:assert/strict');
const test = require('node:test');
const { resolve } = require('node:path');
const { buildSync } = require('esbuild');

const { text } = buildSync({
  entryPoints: [resolve(__dirname, '../../stock-ticker/src/services/stock-data.ts')],
  bundle: true, platform: 'node', external: ['pay-back-core'], write: false,
}).outputFiles[0];
const built = { exports: {} };
new Function('require', 'module', 'exports', text)(require, built, built.exports);
const { StockDataService } = built.exports;

test('按报价的交易日跳过当日记录，比较最近两个已完成交易日', async () => {
  const service = new StockDataService();
  let indexRequests = 0;
  let omitYesterdayTurnover = false;
  service.fetchHttp = async (url) => {
    if (url.includes('/v6/time/')) {
      return 'quote({"zs_1A0001":{"date":"20261123","pre":"3500","data":"0930,3490"}})';
    }
    if (url.includes('turnover_minute')) return '{"data":{"charts":{}}}';
    if (url.includes('turnover_day')) {
      const points = [
        [Date.parse('2026-11-19T00:00:00+08:00'), 150e8],
        [Date.parse('2026-11-20T00:00:00+08:00'), 120e8],
        [Date.parse('2026-11-23T00:00:00+08:00'), 90e8],
      ];
      return JSON.stringify({ data: { charts: { point_list: omitYesterdayTurnover ? [points[0], points[2]] : points } } });
    }
    indexRequests++;
    return 'quote({"data":"20261119,0,0,0,3400;20261120,0,0,0,3500;20261123,0,0,0,3490"})';
  };

  const regular = await service.fetchQuote();
  assert.equal(regular.previousSession, undefined);
  assert.equal(indexRequests, 0);
  for (let retry = 0; retry < 2; retry++) {
    const { previousSession } = await service.fetchQuote(undefined, true);
    assert.equal(previousSession.changePercent.toFixed(2), '2.94');
    assert.equal(previousSession.turnoverChange, -30e8);
  }
  omitYesterdayTurnover = true;
  assert.equal((await service.fetchQuote(undefined, true)).previousSession.turnoverChange, undefined);
  assert.equal(indexRequests, 1);
});
