const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

// 执行实际生成的脚本，确保模板转义后链接仍然有效。
const source = fs.readFileSync('src/components/chart-webview.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const html = context.exports.buildChartHtml({});
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const functions = script.slice(script.indexOf('  function escapeHtml'), script.indexOf('  renderDashboard();'));
vm.runInNewContext(functions + '\nthis.card = buildCard;', context);
const card = (code) => context.card('测试', 'dot-red', [{ code, name: '名称"<>', changePercent: 1 }]);
assert.match(card('600519.SH'), /href="https:\/\/stockpage\.10jqka\.com\.cn\/600519\/"/);
assert.match(card('000001.SZ'), /href="https:\/\/stockpage\.10jqka\.com\.cn\/000001\/"/);
assert.match(card('881121.TI'), /href="https:\/\/q\.10jqka\.com\.cn\/thshy\/detail\/code\/881121\/"/);
assert.match(card('885611'), /href="https:\/\/q\.10jqka\.com\.cn\/thshy\/detail\/code\/885611\/"/);
assert.match(card('600519'), /名称&quot;&lt;&gt;/);
for (const code of ['', 'javascript:alert(1)', '600519/evil', undefined]) {
  assert.doesNotMatch(card(code), /href=/);
}
