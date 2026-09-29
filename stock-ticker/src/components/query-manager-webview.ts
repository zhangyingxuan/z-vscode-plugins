import type { BoardQueries, CustomBoard } from "../services/stock-data";

/** 看板自动刷新设置 */
export interface QueryManagerSettings {
  /** 是否自动刷新看板 */
  boardAutoRefresh: boolean;
  /** 自动刷新间隔（秒） */
  boardRefreshInterval: number;
}

/**
 * 生成看板问答语句管理页的完整 HTML
 * 表单提交/恢复默认通过 vscode.postMessage 与扩展宿主交互
 */
export function buildQueryManagerHtml(
  queries: BoardQueries,
  defaults: BoardQueries,
  settings: QueryManagerSettings,
  customBoards: CustomBoard[] = [],
): string {
  const fields: Array<{
    key: keyof BoardQueries;
    label: string;
    hint: string;
  }> = [
    {
      key: "sectorHigh",
      label: "板块 · 新高",
      hint: "示例：同花顺行业新高（行业指数创历史新高）；亦可带周期，如「创60日新高的同花顺二级行业」",
    },
    {
      key: "sectorLow",
      label: "板块 · 新低",
      hint: "示例：同花顺行业新低",
    },
    {
      key: "sectorNotNewLow",
      label: "板块 · 不创新低",
      hint: "示例：同花顺行业未创新低（板块未创区间新低）",
    },
    {
      key: "stockHigh",
      label: "个股 · 新高",
      hint: "示例：创60日新高的个股 非ST",
    },
    {
      key: "stockLow",
      label: "个股 · 新低",
      hint: "示例：创60日新低的个股 非ST",
    },
    {
      key: "stockNotNewLow",
      label: "个股 · 不创新低",
      hint: "示例：未创60日新低的个股 非ST",
    },
  ];

  const rowsHtml = fields
    .map(
      (f) => `
      <div class="field">
        <label for="${f.key}">${f.label}</label>
        <textarea id="${f.key}" data-key="${f.key}" rows="1" spellcheck="false">${escapeAttr(
          queries[f.key] ?? "",
        )}</textarea>
        <div class="hint">${f.hint}</div>
      </div>`,
    )
    .join("");

  const autoChecked = settings.boardAutoRefresh ? "checked" : "";
  const intervalDisabled = settings.boardAutoRefresh ? "" : "disabled";
  const interval = Math.max(1, Math.floor(settings.boardRefreshInterval || 300));

  const defaultsJson = JSON.stringify(defaults)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

  const customJson = JSON.stringify(customBoards)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>看板问答语句管理</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #d4d4d4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    padding: 20px;
    max-width: 720px;
  }
  h1 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
  .sub {
    font-size: 12px;
    opacity: 0.65;
    margin-bottom: 20px;
    line-height: 1.6;
  }
  .field { margin-bottom: 16px; }
  .field label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .field textarea {
    width: 100%;
    box-sizing: border-box;
    resize: none;
    overflow-y: auto;
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.6;
    font-family: inherit;
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 4px;
    max-height: calc(1.6em * 3 + 16px); /* 最多显示 3 行 */
  }
  .field textarea:focus,
  .field input[type="number"]:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .hint { font-size: 11px; opacity: 0.55; margin-top: 4px; line-height: 1.5; }
  #custom-list { margin-bottom: 12px; }
  .custom-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .custom-row .cb-name {
    width: 130px;
    flex-shrink: 0;
    padding: 8px 10px;
    font-size: 13px;
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 4px;
    box-sizing: border-box;
  }
  .custom-row .cb-module {
    width: 92px;
    flex-shrink: 0;
    padding: 7px 6px;
    font-size: 12px;
    background: var(--vscode-dropdown-background, #252526);
    color: var(--vscode-dropdown-foreground, #ccc);
    border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
    border-radius: 4px;
    box-sizing: border-box;
  }
  .custom-row textarea {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    resize: none;
    overflow-y: auto;
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.6;
    font-family: inherit;
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 4px;
    max-height: calc(1.6em * 3 + 16px);
  }
  .custom-row .cb-name:focus,
  .custom-row textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .custom-row .cb-del {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, #555);
    color: var(--vscode-button-secondaryForeground, #ccc);
    padding: 7px 12px;
    font-size: 12px;
  }
  .custom-row .cb-del:hover { background: rgba(239,68,68,0.15); color: #ef4444; }
  #add-custom { margin-bottom: 6px; }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    margin: 24px 0 12px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-editorWidget-border, #333);
  }
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .switch-row .label-wrap { font-size: 13px; }
  .switch-row .label-wrap .desc { font-size: 11px; opacity: 0.55; margin-top: 2px; }
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--vscode-button-background, #0e639c);
    cursor: pointer;
    flex-shrink: 0;
  }
  .interval-row { display: flex; align-items: center; gap: 10px; }
  .interval-row input[type="number"] {
    width: 120px;
    padding: 7px 10px;
    font-size: 13px;
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 4px;
  }
  .interval-row input[type="number"]:disabled { opacity: 0.4; }
  .interval-row .unit { font-size: 12px; opacity: 0.6; }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 22px;
  }
  button {
    background: var(--vscode-button-background, #0e639c);
    border: none;
    color: var(--vscode-button-foreground, #fff);
    padding: 7px 18px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  button.secondary {
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, #555);
    color: var(--vscode-button-secondaryForeground, #ccc);
  }
  button.secondary:hover { background: rgba(128,128,128,0.15); }
  #toast {
    font-size: 12px;
    color: #22c55e;
    opacity: 0;
    transition: opacity 0.3s;
  }
  #toast.show { opacity: 1; }
</style>
</head>
<body>
  <h1>看板问答语句管理</h1>
  <div class="sub">
    新高 / 新低 / 不创新低看板通过爱问财（iwencai.com）自然语言问答获取数据。
    下方六个问题分别对应看板的不同分组，保存后立即生效并自动刷新看板。
    <br>若某分组持续为空，说明该问句在爱问财没有返回结果，可调整措辞后重试。
  </div>
  ${rowsHtml}

  <div class="section-title">自定义看板</div>
  <div class="sub">
    可新增 / 编辑 / 删除自定义看板；每条问句在看板页面生成一张对应列表（最多展示 8 项）。
    <br>名称与问句都非空才会保存生效。
  </div>
  <div id="custom-list"></div>
  <button id="add-custom" class="secondary">+ 新增看板</button>

  <div class="section-title">自动刷新</div>
  <div class="switch-row">
    <div class="label-wrap">
      开启看板自动刷新
      <div class="desc">默认关闭；开启后按下方频率（秒）在交易时段自动更新</div>
    </div>
    <input type="checkbox" id="autoRefresh" ${autoChecked} />
  </div>
  <div class="field">
    <div class="interval-row">
      <input type="number" id="refreshInterval" min="1" step="1" value="${interval}" ${intervalDisabled} />
      <span class="unit">秒</span>
    </div>
    <div class="hint">自动刷新间隔，单位：秒；仅在开启自动刷新且处于交易时段时生效</div>
  </div>

  <div class="actions">
    <button id="save">保存并刷新看板</button>
    <button id="restore" class="secondary">恢复默认</button>
    <span id="toast">已保存</span>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const DEFAULTS = ${defaultsJson};

  const autoCb = document.getElementById('autoRefresh');
  const intervalInput = document.getElementById('refreshInterval');

  // 开关联动：关闭时禁用频率输入
  function syncInterval() {
    intervalInput.disabled = !autoCb.checked;
  }
  autoCb.addEventListener('change', syncInterval);
  syncInterval();

  // 问句多行输入：随内容自动增高，最多显示 3 行
  const MAX_ROWS = 3;
  function autosize(t) {
    t.style.height = 'auto';
    const cs = getComputedStyle(t);
    const lineH = parseFloat(cs.lineHeight) || 20;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const max = lineH * MAX_ROWS + pad;
    t.style.height = Math.min(t.scrollHeight, max) + 'px';
  }
  for (const t of document.querySelectorAll('textarea[data-key]')) {
    autosize(t);
    t.addEventListener('input', () => autosize(t));
  }

  // ── 自定义看板：渲染 / 新增 / 删除 / 收集 ──
  const CUSTOM = ${customJson};
  const listEl = document.getElementById('custom-list');
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function bindAutosize(t) {
    autosize(t);
    t.addEventListener('input', () => autosize(t));
  }
  function renderCustom() {
    let h = '';
    for (const b of CUSTOM) {
      h += '<div class="custom-row" data-id="' + esc(b.id) + '">';
      h += '<input class="cb-name" value="' + esc(b.name) + '" placeholder="看板名称" />';
      h += '<select class="cb-module" title="归属看板模块">';
      h += '<option value="sector"' + (b.module !== 'stock' ? ' selected' : '') + '>板块</option>';
      h += '<option value="stock"' + (b.module === 'stock' ? ' selected' : '') + '>个股</option>';
      h += '</select>';
      h += '<textarea rows="1" spellcheck="false" placeholder="问句">' + esc(b.question) + '</textarea>';
      h += '<button class="cb-del" title="删除该看板">删除</button>';
      h += '</div>';
    }
    listEl.innerHTML = h;
    listEl.querySelectorAll('.custom-row textarea').forEach(bindAutosize);
    listEl.querySelectorAll('.cb-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.custom-row');
        const id = row.dataset.id;
        const i = CUSTOM.findIndex((b) => b.id === id);
        if (i >= 0) CUSTOM.splice(i, 1);
        row.remove();
      });
    });
  }
  renderCustom();

  document.getElementById('add-custom').addEventListener('click', () => {
    CUSTOM.push({
      id: 'cb' + Date.now() + Math.random().toString(36).slice(2, 7),
      name: '',
      question: '',
      module: 'sector',
    });
    renderCustom();
  });

  document.getElementById('save').addEventListener('click', () => {
    const queries = {};
    for (const input of document.querySelectorAll('[data-key]')) {
      queries[input.dataset.key] = input.value.trim();
    }
    const customBoards = [];
    for (const row of listEl.querySelectorAll('.custom-row')) {
      const name = row.querySelector('.cb-name').value.trim();
      const question = row.querySelector('textarea').value.trim();
      if (name && question) {
        customBoards.push({
          id: row.dataset.id,
          name,
          question,
          module: row.querySelector('.cb-module').value,
        });
      }
    }
    const interval = Math.max(1, Math.floor(parseInt(intervalInput.value, 10) || 300));
    vscode.postMessage({
      type: 'saveConfig',
      data: {
        queries,
        boardAutoRefresh: autoCb.checked,
        boardRefreshInterval: interval,
        customBoards,
      },
    });
  });

  document.getElementById('restore').addEventListener('click', () => {
    vscode.postMessage({ type: 'restoreDefaults' });
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'saved') {
      const toast = document.getElementById('toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1600);
    }
  });
</script>
</body>
</html>`;
}

/** HTML 属性转义 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}