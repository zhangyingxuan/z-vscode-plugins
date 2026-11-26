import { app, BrowserWindow, ipcMain, screen } from 'electron';
import type { Display } from 'electron';
import { join } from 'node:path';
import { StockDataService } from '../../../stock-ticker/src/services/stock-data';
import { formatPercent, formatQuote, formatTurnover, formatVolumeChange, isMarketOpen } from './quote.mjs';
import { compactHeight, detailsHeight, fitBounds, fitDragBounds, getHoverLayout } from './window-layout.mjs';

const width = 170;
const service = new StockDataService();
let window: BrowserWindow | undefined;
let hoverAbove: boolean | undefined;
let dragOffset: { x: number; y: number } | undefined;
type DisplayQuote = ReturnType<typeof formatQuote> & { details: [string, string, string, string?, string?][] };
let latest: DisplayQuote | undefined;
let pending: Promise<DisplayQuote> | undefined;
let lastFetchFailed = false;

function getWorkArea(display: Display) {
  const { x, y, width, height } = display.workArea;
  // Windows 会在内容区域外绘制一像素边框，为边框也留出空间。
  return process.platform === 'win32' ? { x: x + 1, y: y + 1, width: width - 2, height: height - 2 } : display.workArea;
}

function updateWindowShape(ticker: BrowserWindow, compact: boolean) {
  // Windows 给原生窗口保留最小高度，收起时把绘制和点击区域裁到行情条高度。
  if (process.platform === 'win32') {
    const { width } = ticker.getBounds();
    ticker.setShape(compact ? [{ x: 0, y: 0, width, height: compactHeight }] : []);
  }
}

ipcMain.handle('ticker:quote', (event, force: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('无效的行情请求');
  if (pending) return pending;
  if (force !== true && latest && !lastFetchFailed && !isMarketOpen()) return latest;

  // 合并在途请求，避免秒级轮询和手动刷新叠加。
  pending = service.fetchQuote(AbortSignal.timeout(10_000), true)
    .then((quote) => {
      if (quote.price <= 0 || quote.prevClose <= 0 || quote.turnover <= 0) {
        throw new Error('当前未取得完整行情');
      }
      const summary = formatQuote(quote);
      const previous = quote.previousSession;
      const previousPercent = previous?.changePercent === undefined ? '—' : formatPercent(previous.changePercent);
      const previousVolume = previous?.turnoverChange === undefined ? undefined : formatVolumeChange(previous.turnoverChange);
      // 昨日涨跌与缩放量按已完成交易日展示，缺失数据留空标记。
      latest = {
        ...summary,
        details: [
          ['点位', summary.price, quote.prevClose.toFixed(2)],
          ['涨跌', summary.percent, previousPercent],
          ['缩放量', summary.volume ? summary.volume + ' 亿' : '—', previousVolume ? previousVolume.volume + ' 亿' : '—', summary.volumeDirection, previousVolume?.volumeDirection],
          ['成交额', summary.turnover, formatTurnover(quote.prevTurnover)],
          ['5/60日均额', formatTurnover(quote.avgTurnover5), formatTurnover(quote.avgTurnover60)],
        ],
      };
      lastFetchFailed = false;
      return latest;
    })
    .catch((error) => {
      lastFetchFailed = true;
      throw error;
    })
    .finally(() => { pending = undefined; });
  return pending;
});

ipcMain.on('ticker:close', (event) => {
  if (event.sender === window?.webContents) window.close();
});

ipcMain.on('ticker:drag', (event, phase: unknown) => {
  const ticker = window;
  if (!ticker || event.sender !== ticker.webContents) return;
  if (phase === 'end') {
    dragOffset = undefined;
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const bounds = ticker.getBounds();
  if (phase === 'start') {
    dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    return;
  }
  if (phase !== 'move' || !dragOffset) return;
  // 按鼠标所在屏幕约束目标位置，拖到边界后还能继续跨屏或往回拖。
  const area = getWorkArea(screen.getDisplayNearestPoint(cursor));
  const compact = hoverAbove === undefined;
  const fitted = fitDragBounds({ ...bounds, x: cursor.x - dragOffset.x, y: cursor.y - dragOffset.y }, area, compact);
  if (fitted.x !== bounds.x || fitted.y !== bounds.y || fitted.width !== bounds.width || (!compact && fitted.height !== bounds.height)) {
    ticker.setBounds(fitted);
  }
});

ipcMain.handle('ticker:details', (event, open: unknown) => {
  const ticker = window;
  if (!ticker || event.sender !== ticker.webContents || typeof open !== 'boolean') return;
  const bounds = ticker.getBounds();
  const area = getWorkArea(screen.getDisplayMatching(bounds));
  if (open && hoverAbove === undefined) {
    const { above, ...layout } = getHoverLayout(bounds, area);
    hoverAbove = above;
    updateWindowShape(ticker, false);
    ticker.setBounds(layout);
  } else if (!open && hoverAbove !== undefined) {
    // 使用当前坐标收起，展开期间拖动后也能保留新位置。
    const y = hoverAbove ? bounds.y + bounds.height - compactHeight : bounds.y;
    ticker.setBounds(fitBounds({ ...bounds, y, width, height: compactHeight }, area));
    hoverAbove = undefined;
    updateWindowShape(ticker, true);
  }
  return hoverAbove;
});

function createWindow() {
  const area = getWorkArea(screen.getPrimaryDisplay());
  // 从主屏工作区右下角打开，让出任务栏并避免启动时抢焦点。
  window = new BrowserWindow({
    ...fitBounds({ width, height: compactHeight, x: area.x + area.width - width - 16, y: area.y + area.height - compactHeight - 16 }, area),
    frame: false, thickFrame: false, resizable: false, skipTaskbar: true, show: false,
    // Windows 的原生最小高度大于行情条，透明窗口可避免裁剪区外露出白底。
    transparent: process.platform === 'win32',
    backgroundColor: '#191c21',
    webPreferences: {
      preload: join(__dirname, '../src/preload/preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  });
  const ticker = window;
  // 使用高层置顶，避免 Windows 拖动时按默认层级将浮窗放到任务栏之后。
  ticker.setAlwaysOnTop(true, 'screen-saver');
  const fitToDisplay = () => {
    // 拔屏或任务栏变化时，立即把窗口移回当前可用区域。
    const bounds = ticker.getBounds();
    const area = getWorkArea(screen.getDisplayMatching(bounds));
    const height = hoverAbove === undefined ? compactHeight : compactHeight + detailsHeight;
    ticker.setBounds(fitBounds({ ...bounds, width, height }, area));
    updateWindowShape(ticker, hoverAbove === undefined);
  };
  screen.on('display-removed', fitToDisplay);
  screen.on('display-metrics-changed', fitToDisplay);
  ticker.webContents.on('will-navigate', (event) => event.preventDefault());
  ticker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ticker.once('ready-to-show', () => {
    updateWindowShape(ticker, true);
    ticker.showInactive();
  });
  ticker.once('closed', () => {
    screen.removeListener('display-removed', fitToDisplay);
    screen.removeListener('display-metrics-changed', fitToDisplay);
    window = undefined;
  });
  void ticker.loadFile(join(__dirname, '../src/renderer/index.html'));
}

// 重复启动时唤回现有浮窗，避免出现多个行情请求循环。
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => window?.show());
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
} else {
  app.quit();
}
