import * as vscode from "vscode";
import {
  StockDataService,
  StockQuote,
  BoardData,
  BoardQueries,
  CustomBoard,
  DEFAULT_BOARD_QUERIES,
} from "./services/stock-data";
import { buildChartHtml } from "./components/chart-webview";
import { buildQueryManagerHtml } from "./components/query-manager-webview";

let statusBarItem: vscode.StatusBarItem;
let service: StockDataService;
/** 定时器句柄（Node 环境下 setInterval 返回值） */
type TimerHandle = NodeJS.Timeout;
let refreshTimer: TimerHandle | undefined;
let boardRefreshTimer: TimerHandle | undefined;
/** 当前是否有一个行情请求在途（用于定时路径背压跳过） */
let quoteInFlight = false;
/** 在途行情请求的取消控制器（手动刷新时抢占取消） */
let quoteAbort: AbortController | undefined;
let chartPanel: vscode.WebviewPanel | undefined;
let latestQuote: StockQuote | undefined;
let latestBoard: BoardData | undefined;
let lastFetchFailed = false;
/** 最近一次成功获取行情的本地时间戳（ms），用于分时图展示 */
let lastQuoteFetchTime: number | undefined;
/** 最近一次成功获取看板的本地时间戳（ms），用于看板模块展示 */
let lastBoardFetchTime: number | undefined;
let queryManagerPanel: vscode.WebviewPanel | undefined;

/** 看板自动刷新默认值（与 package.json 一致） */
const DEFAULT_BOARD_AUTO_REFRESH = false;
const DEFAULT_BOARD_REFRESH_INTERVAL = 300;

export function activate(context: vscode.ExtensionContext) {
  service = new StockDataService();

  // ── 状态栏 ──
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "stock-ticker.showChart";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── 命令 ──
  context.subscriptions.push(
    vscode.commands.registerCommand("stock-ticker.showChart", openChart),
    vscode.commands.registerCommand("stock-ticker.refresh", () => refresh()),
    vscode.commands.registerCommand(
      "stock-ticker.manageBoardQueries",
      openQueryManager,
    ),
  );

  // 首次拉取
  refresh();
  // 定时刷新
  startTimer();
}

export function deactivate() {
  stopTimer();
}

// ────────────────────────────────────────────
//  数据刷新
// ────────────────────────────────────────────

async function refresh(force = false) {
  const inSession = isMarketOpen();

  if (!inSession && latestQuote && !lastFetchFailed && !force) {
    // 非交易时段且已有数据且上次成功 → 不再刷新，保留最后一次展示
    return;
  }

  // 背压：上一次行情请求仍在途时
  //  - 定时路径：跳过本 tick（不叠加请求，避免慢网络下堆积）
  //  - 手动路径（force）：取消在途请求，抢占发起一次新的
  if (quoteInFlight) {
    if (!force) return;
    quoteAbort?.abort();
  }

  const ctrl = new AbortController();
  quoteInFlight = true;
  quoteAbort = ctrl;

  try {
    // 获取行情数据（快速响应）
    const quote = await service.fetchQuote(ctrl.signal);
    latestQuote = quote;
    lastFetchFailed = false;
    lastQuoteFetchTime = Date.now();
    renderStatusBar(latestQuote);

    // 更新图表的行情部分
    if (chartPanel) {
      chartPanel.webview.postMessage({
        type: "quoteUpdated",
        updatedAt: lastQuoteFetchTime,
        data: {
          price: quote.price,
          changePercent: quote.changePercent,
          changeAmount: quote.changeAmount,
          prevClose: quote.prevClose,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          turnover: quote.turnover,
          prevTurnover: quote.prevTurnover,
          turnoverChange: quote.turnoverChange,
          predictTurnover: quote.predictTurnover,
          avgTurnover5: quote.avgTurnover5,
          avgTurnover60: quote.avgTurnover60,
          trends: quote.trends,
          indexTrends: quote.indexTrends,
        },
      });
    }

    // 看板（新高/新低）默认不随行情定时刷新：仅手动刷新命令时拉取。
    // 定时自动刷新由 boardAutoRefresh 独立定时器控制（见 startBoardTimer）。
    if (force) {
      refreshBoard();
    }
  } catch (err: any) {
    // 被手动刷新抢占取消的请求不算失败，保留现有展示
    if (ctrl.signal.aborted) return;
    lastFetchFailed = true;
    statusBarItem.text = `$(warning) 上证指数: 获取失败`;
    statusBarItem.tooltip = `获取行情失败: ${err?.message ?? err}\n点击重试`;
  } finally {
    // 仅当本次调用仍是当前在途请求时才复位状态（避免覆盖被抢占的新请求）
    if (quoteAbort === ctrl) {
      quoteInFlight = false;
      quoteAbort = undefined;
    }
  }
}

async function refreshBoard() {
  try {
    const board = await service.fetchBoardData(
      getBoardQueries(),
      getCustomBoards(),
    );
    latestBoard = board;
    lastBoardFetchTime = Date.now();
    if (chartPanel) {
      chartPanel.webview.postMessage({
        type: "boardUpdated",
        data: board,
        updatedAt: lastBoardFetchTime,
      });
    }
  } catch (err) {
    console.warn("[stock-ticker] 看板刷新失败:", err);
  }
}

/** 读取用户配置的看板问答语句（缺省项回退默认值） */
function getBoardQueries(): BoardQueries {
  const cfg = vscode.workspace
    .getConfiguration("stock-ticker")
    .get<Partial<BoardQueries>>("boardQueries", {});
  return { ...DEFAULT_BOARD_QUERIES, ...cfg };
}

/** 读取用户配置的自定义看板（过滤无效项，保证 id/name/question 齐全） */
function getCustomBoards(): CustomBoard[] {
  const raw = vscode.workspace
    .getConfiguration("stock-ticker")
    .get<CustomBoard[]>("customBoards", []);
  return Array.isArray(raw)
    ? raw.filter(
        (b): b is CustomBoard =>
          !!b &&
          typeof b === "object" &&
          typeof b.id === "string" &&
          typeof b.name === "string" &&
          b.name.trim() !== "" &&
          typeof b.question === "string" &&
          b.question.trim() !== "",
      )
    : [];
}

function renderStatusBar(q: StockQuote) {
  // 涨跌方向：正=红▲，负=绿▼
  const sign = q.changePercent >= 0 ? "+" : "";
  const icon = q.changePercent > 0 ? "▲" : q.changePercent < 0 ? "▼" : "●";

  // 状态栏文字颜色：涨红 / 跌绿
  if (q.changePercent > 0) {
    statusBarItem.color = new vscode.ThemeColor("errorForeground");
  } else if (q.changePercent < 0) {
    statusBarItem.color = new vscode.ThemeColor("terminal.ansiGreen");
  } else {
    statusBarItem.color = undefined;
  }

  // 较昨日同期放量/缩量额（亿元，不带单位）
  const diffYi = (Math.abs(q.turnoverChange) / 1e8).toFixed(0);
  const volText =
    q.turnoverChange > 0
      ? `放量${diffYi}`
      : q.turnoverChange < 0
        ? `缩量${diffYi}`
        : ``;

  statusBarItem.text = `${icon} ${q.price.toFixed(2)} ${sign}${q.changePercent.toFixed(2)}% ${volText}`;

  const volText2 =
    q.turnoverChange > 0
      ? `放量 ${formatTurnover(Math.abs(q.turnoverChange))}`
      : q.turnoverChange < 0
        ? `缩量 ${formatTurnover(Math.abs(q.turnoverChange))}`
        : `持平`;

  statusBarItem.tooltip = new vscode.MarkdownString(
    [
      "| 指标 | 今日 | 昨日 |",
      "| --- | --- | --- |",
      `| 点位 | ${q.price.toFixed(2)} | ${q.prevClose.toFixed(2)} |`,
      `| 涨跌 | ${sign}${q.changePercent.toFixed(2)}% | — |`,
      `| 成交额 | ${formatTurnover(q.turnover)} | ${formatTurnover(q.prevTurnover)} |`,
      `| 成交量 | ${volText2} | — |`,
      `| 开/高/低 | ${q.open.toFixed(2)} / ${q.high.toFixed(2)} / ${q.low.toFixed(2)} | — |`,
      `| 预测全天 | ${formatTurnover(q.predictTurnover)} | — |`,
      `| 均额5/60日 | — | ${formatTurnover(q.avgTurnover5)} / ${formatTurnover(q.avgTurnover60)} |`,
      "",
      "_点击打开分时图_",
    ].join("\n"),
  );
}

// ────────────────────────────────────────────
//  分时图 Webview
// ────────────────────────────────────────────

function openChart() {
  if (chartPanel) {
    chartPanel.dispose();
    return;
  }

  chartPanel = vscode.window.createWebviewPanel(
    "stockChart",
    "分时图",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true },
  );

  // 始终设置 HTML，即使没有数据（会显示加载中状态）
  chartPanel.webview.html = buildChartHtml(
    latestQuote || {
      price: 0,
      changePercent: 0,
      changeAmount: 0,
      prevClose: 0,
      open: 0,
      high: 0,
      low: 0,
      turnover: 0,
      prevTurnover: 0,
      turnoverChange: 0,
      predictTurnover: 0,
      avgTurnover5: 0,
      avgTurnover60: 0,
      trends: [],
      indexTrends: [],
    },
    latestBoard,
    lastQuoteFetchTime,
    lastBoardFetchTime,
  );

  // 看板默认不自动刷新：每次打开分时图都拉取一次，确保看板有数据
  refreshBoard();

  chartPanel.webview.onDidReceiveMessage((msg: { type: string }) => {
    if (msg.type === "refresh") {
      refresh(true);
    } else if (msg.type === "refreshBoard") {
      refreshBoard();
    } else if (msg.type === "manageQueries") {
      openQueryManager();
    }
  });

  chartPanel.onDidDispose(() => {
    chartPanel = undefined;
  });
}

// ────────────────────────────────────────────
//  看板问句管理 Webview
// ────────────────────────────────────────────

function openQueryManager() {
  if (queryManagerPanel) {
    queryManagerPanel.reveal(vscode.ViewColumn.Beside, true);
    return;
  }

  queryManagerPanel = vscode.window.createWebviewPanel(
    "queryManager",
    "看板问答语句管理",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true },
  );

  const render = () => {
    const cfg = vscode.workspace.getConfiguration("stock-ticker");
    queryManagerPanel!.webview.html = buildQueryManagerHtml(
      getBoardQueries(),
      DEFAULT_BOARD_QUERIES,
      {
        boardAutoRefresh: cfg.get<boolean>(
          "boardAutoRefresh",
          DEFAULT_BOARD_AUTO_REFRESH,
        ),
        boardRefreshInterval: cfg.get<number>(
          "boardRefreshInterval",
          DEFAULT_BOARD_REFRESH_INTERVAL,
        ),
      },
      getCustomBoards(),
    );
  };
  render();

  queryManagerPanel.webview.onDidReceiveMessage(
    (msg: {
      type: string;
      data?: {
        queries?: Partial<BoardQueries>;
        boardAutoRefresh?: boolean;
        boardRefreshInterval?: number;
        customBoards?: CustomBoard[];
      };
    }) => {
      if (msg.type === "saveConfig" && msg.data) {
        const cfg = vscode.workspace.getConfiguration("stock-ticker");
        const {
          queries,
          boardAutoRefresh,
          boardRefreshInterval,
          customBoards,
        } = msg.data;
        const auto =
          boardAutoRefresh ??
          cfg.get<boolean>("boardAutoRefresh", DEFAULT_BOARD_AUTO_REFRESH);
        const interval = Math.max(
          1,
          Math.floor(
            boardRefreshInterval ??
              cfg.get<number>(
                "boardRefreshInterval",
                DEFAULT_BOARD_REFRESH_INTERVAL,
              ),
          ),
        );
        const boards = customBoards ?? getCustomBoards();
        Promise.all([
          cfg.update(
            "boardQueries",
            { ...getBoardQueries(), ...(queries ?? {}) },
            vscode.ConfigurationTarget.Global,
          ),
          cfg.update(
            "boardAutoRefresh",
            auto,
            vscode.ConfigurationTarget.Global,
          ),
          cfg.update(
            "boardRefreshInterval",
            interval,
            vscode.ConfigurationTarget.Global,
          ),
          cfg.update("customBoards", boards, vscode.ConfigurationTarget.Global),
        ]).then(() => {
          queryManagerPanel?.webview.postMessage({ type: "saved" });
          startBoardTimer(); // 按新设置立即重起看板自动刷新
          refreshBoard();
        });
      } else if (msg.type === "restoreDefaults") {
        const cfg = vscode.workspace.getConfiguration("stock-ticker");
        Promise.all([
          cfg.update(
            "boardQueries",
            DEFAULT_BOARD_QUERIES,
            vscode.ConfigurationTarget.Global,
          ),
          cfg.update(
            "boardAutoRefresh",
            DEFAULT_BOARD_AUTO_REFRESH,
            vscode.ConfigurationTarget.Global,
          ),
          cfg.update(
            "boardRefreshInterval",
            DEFAULT_BOARD_REFRESH_INTERVAL,
            vscode.ConfigurationTarget.Global,
          ),
          cfg.update("customBoards", [], vscode.ConfigurationTarget.Global),
        ]).then(() => {
          queryManagerPanel?.webview.postMessage({ type: "saved" });
          render();
          startBoardTimer();
          refreshBoard();
        });
      }
    },
  );

  queryManagerPanel.onDidDispose(() => {
    queryManagerPanel = undefined;
  });
}

// ────────────────────────────────────────────
//  工具函数
// ────────────────────────────────────────────

function startTimer() {
  stopTimer();
  const sec = vscode.workspace
    .getConfiguration("stock-ticker")
    .get<number>("refreshInterval", 1);
  refreshTimer = setInterval(refresh, Math.max(sec, 1) * 1000);
  startBoardTimer();
}

/** 看板（新高/新低）自动刷新：默认关闭，由 boardAutoRefresh 开启 */
function startBoardTimer() {
  stopBoardTimer();
  const cfg = vscode.workspace.getConfiguration("stock-ticker");
  if (!cfg.get<boolean>("boardAutoRefresh", false)) {
    return;
  }
  const sec = cfg.get<number>("boardRefreshInterval", 300);
  boardRefreshTimer = setInterval(
    () => {
      // 自动刷新仅在交易时段执行；手动「刷新看板」不受此限制
      if (isMarketOpen()) refreshBoard();
    },
    Math.max(sec, 1) * 1000,
  );
}

function stopTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  stopBoardTimer();
}

function stopBoardTimer() {
  if (boardRefreshTimer) {
    clearInterval(boardRefreshTimer);
    boardRefreshTimer = undefined;
  }
}

/** 判断当前是否在 A 股交易时段（UTC+8） */
function isMarketOpen(): boolean {
  const now = new Date();
  // 转为北京时间
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const bj = new Date(utc + 8 * 3600_000);

  const day = bj.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  const hhmm = bj.getHours() * 100 + bj.getMinutes();
  // 上午 09:15 – 11:35（含集合竞价余量）
  // 下午 12:55 – 15:05
  return (hhmm >= 915 && hhmm <= 1135) || (hhmm >= 1255 && hhmm <= 1505);
}

/** 格式化成交额（输入单位：元） */
function formatTurnover(val: number): string {
  if (val >= 1e8) {
    return (val / 1e8).toFixed(2) + " 亿元";
  }
  if (val >= 1e4) {
    return (val / 1e4).toFixed(0) + " 万元";
  }
  return val.toFixed(0) + " 元";
}
