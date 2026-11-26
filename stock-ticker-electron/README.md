# Stock Ticker Electron

在 Windows 上打开置顶行情浮窗。常驻显示上证指数点位、涨跌幅和较昨日同期的放量或缩量金额。缩放量单位为亿元，放量标红、缩量标绿。悬停可查看今日与昨日的行情详情，包括沪深两市累计成交额。

```bash
npm ci
npm start
```

拖动左侧手柄移动浮窗。详情底部可手动刷新或关闭。自动刷新沿用插件的北京时间交易时段和一秒间隔，首次启动会拉取行情，收盘后保留最近一次行情。

构建时直接复用同级 `stock-ticker` 的行情服务，请保留两个项目的目录关系。运行使用同花顺行情接口，无需启动 VS Code。

`npm test` 验证行情格式和交易时段，`npm run build` 构建主进程和 React 页面。

## 源码结构

- `src/main/` 管理 Electron 窗口、原生交互和行情请求。
- `src/preload/` 通过 `window.ticker` 向渲染进程暴露 IPC 接口。
- `src/renderer/` 包含 React 页面、入口 HTML 和样式。
