# Electron 行情浮窗技术架构

> 最后验证：2026-11-25

`stock-ticker-electron` 是同仓库中独立运行的 Windows 桌面应用。Electron 45.5.0 管理原生窗口，React 19.3.1 渲染行情条和详情，esbuild 0.28.2 构建主进程与页面资源。构建时直接复用同级 `stock-ticker` 的行情服务源码，运行时由 Electron 主进程发起行情请求。见 [应用清单](../../stock-ticker-electron/package.json)。

## 进程与模块

| 模块 | 职责 |
|---|---|
| [主进程](../../stock-ticker-electron/src/main/main.ts) | 单实例管理，创建置顶窗口，处理拖动、展收和屏幕变化。发起行情请求，合并在途请求，保存最近一次成功结果并组装详情。 |
| [窗口布局](../../stock-ticker-electron/src/main/window-layout.mjs) | 纯函数计算工作区约束和展开方向，支持多屏负坐标。紧凑高度 30，详情增加 164，初始宽度 170。Windows 通过透明窗口和窗口形状裁剪处理原生最小高度，收起时按可见高度限制拖动范围。 |
| [行情格式](../../stock-ticker-electron/src/main/quote.mjs) | 判断北京时间交易窗口，格式化点位、涨跌幅与成交额，按取整前的成交额差值确定方向。 |
| [预加载桥接](../../stock-ticker-electron/src/preload/preload.cjs) | 通过 `contextBridge` 暴露 `window.ticker`。窗口启用上下文隔离和沙箱，关闭 Node 集成。主进程限制 IPC 发送方，阻止页面导航和新窗口。 |
| [React 渲染层](../../stock-ticker-electron/src/renderer/renderer.jsx) | 维护行情、错误和详情状态。发起秒级刷新，管理指针捕获、离开延时及键盘交互。展收时以主进程返回的方向更新布局，通过序号丢弃过期的展收回执。 |
| [共享行情服务](../../stock-ticker/src/services/stock-data.ts) | `StockDataService` 并行请求同花顺指数行情、沪深成交额分时与日线，可额外补充上一交易日历史数据。 |

## IPC 与行情链路

| 页面方法 | IPC | 处理结果 |
|---|---|---|
| `quote(force)` | `invoke ticker:quote` | 返回格式化行情摘要和详情。传入 `true` 时跳过时段外缓存判断，继续复用在途请求。 |
| `details(open)` | `invoke ticker:details` | 调整原生窗口高度和坐标。展开返回是否朝上，收起后方向清空。 |
| `drag(phase)` | `send ticker:drag` | 接收 `start`、`move`、`end`，根据鼠标屏幕坐标和起始偏移移动窗口。 |
| `close()` | `send ticker:close` | 关闭浮窗，最后一个窗口关闭后退出 Electron。 |

1. React 首次挂载立即请求，此后每秒通过预加载桥接向主进程读取行情。
2. 主进程合并在途请求。时段外有成功结果且上次请求未失败时复用内存快照。其余情况调用 `fetchQuote(signal, true)`，设置 10 秒超时并启用历史补充。
3. 点位、昨收或成交额非正数时拒绝该结果。拉取失败后保留最近一次成功快照，渲染层继续展示旧数据并标出异常。

## 构建与维护

在 `stock-ticker-electron` 目录执行 `npm ci` 和 `npm start`。后者先构建，再启动 Electron。主进程入口为 `dist/main.cjs`，React 输出到 `dist/renderer.js` 和 `dist/renderer.css`，运行时加载源码目录下的本地 HTML 和 preload。构建依赖两个应用的同级目录关系，`electron` 和 `pay-back-core` 保留为外部依赖。

`npm test` 覆盖行情格式、交易窗口、布局边界及上一交易日数据。真实窗口置顶、多屏拖动和展收交互按 [窗体需求](../01-需求分析/Electron行情浮窗需求.md) 在 Windows 验收。

Windows x64 的 ZIP 和单文件 EXE 生成命令见 [Electron 打包流程](../06-开发规范/Electron打包流程.md)。
