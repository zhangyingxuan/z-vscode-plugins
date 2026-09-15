import * as vscode from "vscode";
import { StockDataService, StockQuote, BoardData } from "./services/stock-data";
import { buildChartHtml } from "./components/chart-webview";

let statusBarItem: vscode.StatusBarItem;
let service: StockDataService;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let chartPanel: vscode.WebviewPanel | undefined;
let latestQuote: StockQuote | undefined;
let latestBoard: BoardData | undefined;

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

  if (!inSession && latestQuote && !force) {
    // 非交易时段且已有数据 → 不再刷新，保留最后一次展示
    return;
  }

  try {
    const [quote, board] = await Promise.all([
      service.fetchQuote(),
      service.fetchBoardData(),
    ]);
    latestQuote = quote;
    latestBoard = board;
    renderStatusBar(latestQuote);

    if (chartPanel) {
      chartPanel.webview.html = buildChartHtml(latestQuote, latestBoard);
    }
  } catch (err: any) {
    statusBarItem.text = `$(warning) 上证指数: 获取失败`;
    statusBarItem.tooltip = `获取行情失败: ${err?.message ?? err}\n点击重试`;
  }
}

function renderStatusBar(q: StockQuote) {
  const sign = q.changePercent > 0 ? "+" : "";
  // 中国股市：红涨绿跌
  // 用文字符号 ▲▼ 代替 emoji（emoji 颜色固定且与 A 股惯例相反）
  const icon = q.changePercent > 0 ? "▲" : q.changePercent < 0 ? "▼" : "●";

  // 状态栏文字颜色：涨红 / 跌绿
  if (q.changePercent > 0) {
    statusBarItem.color = new vscode.ThemeColor("errorForeground");
  } else if (q.changePercent < 0) {
    statusBarItem.color = new vscode.ThemeColor("terminal.ansiGreen");
  } else {
    statusBarItem.color = undefined;
  }

  statusBarItem.text = `${icon} 上证 ${q.price.toFixed(2)} ${sign}${q.changePercent.toFixed(2)}%`;

  // 两市成交额 + 较上日对比
  const turnoverStr = formatTurnover(q.turnover);
  let turnoverCompare = "";
  if (q.prevTurnover > 0) {
    const diff = q.turnover - q.prevTurnover;
    const diffAbs = Math.abs(diff);
    const diffStr = formatTurnover(diffAbs);
    if (diff > 0) {
      turnoverCompare = `（同时刻放量 ${diffStr}）`;
    } else if (diff < 0) {
      turnoverCompare = `（同时刻缩量 ${diffStr}）`;
    } else {
      turnoverCompare = `（同时刻持平）`;
    }
  }

  statusBarItem.tooltip = new vscode.MarkdownString(
    [
      `开盘 ${q.open.toFixed(2)}  昨收 ${q.prevClose.toFixed(2)}`,
      `最高 ${q.high.toFixed(2)}  最低 ${q.low.toFixed(2)}`,
      `两市成交 ${turnoverStr}${turnoverCompare}`,
      "",
      "---",
      "_点击打开分时图_",
    ].join("\n\n"),
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
    "上证指数 · 分时图",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true },
  );

  if (latestQuote) {
    chartPanel.webview.html = buildChartHtml(latestQuote, latestBoard);
  }

  chartPanel.webview.onDidReceiveMessage((msg: { type: string }) => {
    if (msg.type === "refresh") {
      refresh(true).then(() => {
        chartPanel?.webview.postMessage({ type: "updated" });
      });
    }
  });

  chartPanel.onDidDispose(() => {
    chartPanel = undefined;
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
}

function stopTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
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
