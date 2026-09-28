# Webview 方案

> 最后验证：2026-09-24

stock-ticker 的两个 Webview（分时图、问句管理）的实现方式与双向消息协议。二者均为自包含 HTML，零外部资源（无 CDN/CSP 依赖）。

---

## 1. 分时图 Webview（chart-webview.ts）

- 入口：`buildChartHtml(quote, board)` 返回完整 HTML 字符串
- 数据注入：`dataJson` / `boardJson` 内联进 HTML（`JSON.stringify`），页面加载即渲染
- 绘制：Canvas，无第三方图表库
  - 分时走势线（红涨绿跌渐变填充）、均价曲线
  - 昨收价参考线（虚线）、网格线 + 右侧价格标签（最高/最低/昨收）+ 底部时间轴
  - 当前价格圆点标记
- 自适应：窗口 resize 重绘，支持高 DPI（devicePixelRatio 缩放）
- 面板按钮：刷新行情 `{type:'refresh'}`、刷新看板 `{type:'refreshBoard'}`、问句管理 `{type:'manageQueries'}`

## 2. 问句管理 Webview（query-manager-webview.ts）

- 入口：`buildQueryManagerHtml(queries, defaults, settings, customBoards)`
- 表单字段：4 个默认问句输入框 + 看板自动刷新开关 + 间隔（秒）+ 自定义看板列表（增删改）
- 间隔强制 `Math.max(1, floor(interval || 300))`，兜底非法输入
- 内联数据做 `<`/`>` 转义（`\u003c`/`\u003e`），防止 HTML 注入；属性值用 `escapeAttr`
- 交互：
  - 保存 → `{type:'saveConfig', data:{queries, boardAutoRefresh, boardRefreshInterval, customBoards}}`
  - 恢复默认 → `{type:'restoreDefaults'}`
  - 扩展宿主保存成功后回 `{type:'saved'}`，页面提示

## 3. 双向消息协议

### Extension → Webview

| type | 目标 | 数据 | 时机 |
|------|------|------|------|
| `quoteUpdated` | 分时图 | `{price, changePercent, …, trends}` | 每次行情刷新成功 |
| `boardUpdated` | 分时图 | `BoardData` | 看板刷新成功 |
| `saved` | 问句管理 | — | 配置保存成功 |

### Webview → Extension

| type | 来源 | 数据 | 扩展侧动作 |
|------|------|------|------------|
| `refresh` | 分时图 | — | `refresh(true)` 手动刷行情 |
| `refreshBoard` | 分时图 | — | `refreshBoard()` |
| `manageQueries` | 分时图 | — | `openQueryManager()` |
| `saveConfig` | 问句管理 | `{queries, boardAutoRefresh, boardRefreshInterval, customBoards}` | 写入用户配置 → 回 `saved` → 重起看板定时器 → 刷新看板 |
| `restoreDefaults` | 问句管理 | — | 恢复默认问句（`DEFAULT_BOARD_QUERIES`）→ 同上 |

## 4. 增量更新设计

- 行情秒级刷新、看板分钟级刷新：两者数据形态与频率差异大
- 分两条消息独立推送（`quoteUpdated` / `boardUpdated`），页面分别更新对应区域，不整页重绘
- 面板内按钮只发消息不刷新页面，保证 UI 状态连续

## 5. 面板生命周期

- `chartPanel` / `queryManagerPanel` 单例：已打开则 `reveal()`，否则重建
- `onDidClose` 回调中把面板引用置 `undefined`，下次打开重建
- 关闭时停止相关定时器引用由 `deactivate()` 统一清理

## 相关文档

- [系统全景](../03-架构设计/系统全景.md)
- [数据服务方案](../04-技术方案/数据服务方案.md)
- [数据模型](../05-API文档/数据模型.md)
- [测试策略与用例](../07-测试用例/测试策略与用例.md)