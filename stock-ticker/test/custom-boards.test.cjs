const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

// 使用真实服务并替换网络边界，验证隐藏项不请求、板块使用指数查询。
const file = path.resolve('src/services/stock-data.ts');
const mod = new Module(file, module);
mod.filename = file;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { StockDataService, createDefaultBoards, DEFAULT_BOARD_QUERIES } = mod.exports;
(async () => {
  const defaults = createDefaultBoards({ ...DEFAULT_BOARD_QUERIES, sectorHigh: '保留旧问句' });
  assert.equal(defaults.length, 6);
  assert.equal(defaults[0].question, '保留旧问句');
  const service = new StockDataService();
  const calls = [];
  service.fetchBoardItems = async (...args) => { calls.push(args); return []; };
  const result = await service.fetchBoardData([
    defaults[0], { ...defaults[1], visible: false }, defaults[3],
  ]);
  assert.deepEqual(calls, [['保留旧问句', true], [defaults[3].question, false]]);
  assert.equal(result.custom.length, 2);
  assert.deepEqual((await service.fetchBoardData([])).custom, []);
  // 验证旧配置只在升级前补入，保存空数组后不会复活默认看板。
  const config = { customBoards: [{ id: 'old', name: '旧看板', question: '旧问句' }] };
  const extension = { exports: {}, require: name => name === 'vscode'
    ? { workspace: { getConfiguration: () => ({ get: (key, fallback) => config[key] ?? fallback }) } }
    : mod.exports };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/extension.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, extension);
  assert.equal(extension.getCustomBoards().length, 7);
  config.boardsVersion = 1;
  config.customBoards = [];
  assert.equal(extension.getCustomBoards().length, 0);
  // 检查实际生成的管理页脚本语法和显示状态的收集逻辑。
  const manager = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/query-manager-webview.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, manager);
  const html = manager.exports.buildQueryManagerHtml({ boardAutoRefresh: false, boardRefreshInterval: 300 }, defaults);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(script);
  const fields = { '.cb-name': { value: '名称' }, textarea: { value: '问句' }, '.cb-module': { value: 'sector' }, '.cb-visible': { checked: false } };
  const form = { listEl: { querySelectorAll: () => [{ dataset: { id: 'test' }, querySelector: key => fields[key] }] } };
  vm.runInNewContext(script.slice(script.indexOf('  function collectBoards()'), script.indexOf("  document.getElementById('save')")), form);
  assert.equal(form.collectBoards()[0].visible, false);
  console.log('custom boards tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
