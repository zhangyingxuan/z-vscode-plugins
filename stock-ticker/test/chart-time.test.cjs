const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/components/chart-webview.ts', 'utf8');
const mapping = source.slice(source.indexOf('    // 实际 X 映射'), source.indexOf('    // ── 上部：上证指数点位分时线 ──'));
const trends = [['09:30'], ['11:30'], ['13:01']];
const context = { trends, pad: { left: 0 }, cw: 240 };
vm.runInNewContext(mapping + '\nthis.indexX = xOfIdx; this.turnX = xOfTurn;', context);
assert.equal(context.indexX(['09:30']), 0);
assert.equal(context.indexX(['11:30']), 120);
assert.equal(context.indexX(['13:00']), 120);
assert.equal(context.indexX(['13:01']), 121);
assert.equal(context.indexX(['15:00']), 240);
assert.equal(context.turnX(1), 120);
assert.equal(context.turnX(2), 121);
