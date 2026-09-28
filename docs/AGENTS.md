# z-vscode-plugins - AI 上下文

> 本文件是 AI 代理的路由表。先读本文件，再按「路由规则」读取目标文件。不要一次全读。

---

## 1. 项目概述（一句话）

z-vscode-plugins 是 VS Code 插件集，当前含一个插件 **stock-ticker**（v0.0.3）——「秒级 A 股指数观测」：状态栏实时显示上证指数行情，侧栏 Canvas 分时图 + 板块/个股新高新低看板，看板问句可由用户自定义。

---

## 2. 代码结构（文件在哪）

```
z-vscode-plugins/
├── stock-ticker/                       # 插件模块（当前唯一）
│   ├── package.json                    # 清单：3 命令 + 2 快捷键 + 5 配置项 + 构建脚本
│   ├── src/
│   │   ├── extension.ts                # 入口：激活 / 状态栏 / 命令 / 定时器 / Webview 生命周期
│   │   ├── services/
│   │   │   ├── stock-data.ts           # 数据服务：同花顺行情 + 爱问财看板 + HTTP + 成交额缓存
│   │   │   └── hexin-v.ts              # 同花顺 Chameleon 指纹 Token 生成（@ts-nocheck 移植）
│   │   └── components/
│   │       ├── chart-webview.ts        # 分时图 Webview（Canvas 绘制，零外部依赖）
│   │       └── query-manager-webview.ts  # 问句管理 Webview
│   ├── out/                            # 编译产物（tsc 输出；vsix 以 out 为 main，不打入 src）
│   └── *.vsix                          # 打包产物（0.0.1 / 0.0.2 / 0.0.3）
├── docs/                               # 知识库（本目录，详见路由规则）
└── skills/                             # wind-mcp-skill（万得金融数据检索技能）
```

---

## 3. 知识库路由规则（两级路由）

先按意图定位分类，再读分类索引找具体文件。最多读 3 个文件。

| 用户意图 | 分类索引 |
|----------|----------|
| 功能、需求、验收标准 | `01-需求分析/_index.md` |
| 业务流程、术语 | `02-业务梳理/_index.md` |
| 架构、设计决策 | `03-架构设计/_index.md` |
| 开发、联调、环境、报错 | `04-技术方案/_index.md` |
| API 接口、数据库 | `05-API文档/_index.md` |
| 技术栈、规范、发布 | `06-开发规范/_index.md` |
| 测试、用例、回归 | `07-测试用例/_index.md` |

**步骤**：读本文件 → 匹配分类 → 读 `_index.md` → 按触发关键词匹配文件 → 读目标文件。
**不确定时先读 `03-架构设计/系统全景.md` 建立全局认知。**

---

## 4. 硬约束（不能做什么）

### 技术栈（VS Code 扩展）

| 约束 | 原因 |
|------|------|
| 零第三方运行时依赖（package.json 的 dependencies 必须为空） | 扩展随 .vsix 分发，控制体积与兼容性 |
| 不得使用 ESM / 高于 ES2020 的语法特性 | tsconfig：module=commonjs、target=ES2020 |
| 不得使用高于 VS Code 1.74.0 的 API | engines.vscode = ^1.74.0，@types/vscode ^1.74 |
| 命令名 / 配置项必须以 `stock-ticker.` 前缀；已注册的 3 命令、5 配置不得删改 | package.json contributes 是唯一事实源 |
| 不得破坏红涨绿跌配色惯例 | A 股市场惯例，UI 一致性 |
| 不得给 `hexin-v.ts` 做类型改造（保持 @ts-nocheck） | 反混淆移植 SDK 改动风险高，无收益 |

### 数据源（同花顺 / 爱问财）

| 约束 | 原因 |
|------|------|
| 每次请求必须携带新生成的 hexin-v 请求头（`createV()`），不得缓存复用 | 同花顺反爬指纹，过期/复用会被拒或 429 |
| 爱问财接口必须 `application/x-www-form-urlencoded` 编码 | JSON 编码会被服务端拒绝 |
| 同花顺接口走 HTTP（非 HTTPS），请求超时 10s，支持 AbortSignal 取消 | 代码硬编码 `THS_LINE_BASE = http://…` |
| 爱问财字段为动态列（如 `指数@涨跌幅:前复权[20260924]`），提取必须精确键名 + 子串双保险 | 列名随接口版本变化 |

### 通用

| 约束 | 原因 |
|------|------|
| 定时刷新仅在交易时段执行（09:15–11:35 / 12:55–15:05 北京时间，周末除外） | 避免非交易时段无谓请求 |
| 看板自动刷新默认关闭（boardAutoRefresh=false） | 默认避免高频请求，用户显式开启 |
| docs/ 下每个分类目录必须有自己的 _index.md，且新文档必须登记 | 两级路由的单一数据源 |

---

## 5. 代码→文档同步规则

| 代码变更 | 必须检查文档 |
|----------|-------------|
| `src/extension.ts`（命令/定时器/状态栏/Webview 生命周期） | `01-需求分析/功能需求清单.md`、`02-业务梳理/业务流程.md` |
| `src/services/stock-data.ts`（接口/解析/缓存） | `05-API文档/外部数据接口.md`、`05-API文档/数据模型.md` |
| `src/services/hexin-v.ts` | `04-技术方案/数据服务方案.md` |
| `src/components/*-webview.ts`（消息协议/UI） | `04-技术方案/Webview方案.md` |
| `package.json` contributes（命令/快捷键/配置项） | `01-需求分析/功能需求清单.md`、`06-开发规范/技术栈.md` |
| `package.json` scripts / 版本号 | `06-开发规范/发布流程.md` |

---

## 6. 维护机制

- **文档保鲜**：每份文档头部 `> 最后验证：YYYY-MM-DD`，超 90 天视为过期
- **过期检查**：`bash scripts/check-staleness.sh`（加 `--full` 检查断链）
- **索引覆盖**：`bash scripts/check-index-coverage.sh`
- **Git 钩子**：`bash scripts/install-hooks.sh` 安装 pre-commit 提醒
- **完整制度**：`维护制度.md`
