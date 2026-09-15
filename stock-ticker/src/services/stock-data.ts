import * as https from "https";

/** 股票行情数据 */
export interface StockQuote {
  /** 当前价格 */
  price: number;
  /** 涨跌幅 (%) */
  changePercent: number;
  /** 涨跌额 */
  changeAmount: number;
  /** 昨日收盘价 */
  prevClose: number;
  /** 今日开盘价 */
  open: number;
  /** 今日最高价 */
  high: number;
  /** 今日最低价 */
  low: number;
  /** 两市成交额（元） */
  turnover: number;
  /** 前一交易日同时刻累计成交额（元），0 表示暂无数据 */
  prevTurnover: number;
  /** 分时数据: [时间, 价格, 均价, 成交量] */
  trends: Array<[string, number, number, number]>;
}

/** 板块看板数据 */
export interface BoardData {
  sectors: {
    newHigh: SectorItem[];
    newLow: SectorItem[];
    noNewLow: SectorItem[];
  };
  stocks: { newHigh: StockItem[]; newLow: StockItem[]; noNewLow: StockItem[] };
}
export interface SectorItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  /** 60日最高价 */
  high60: number;
  /** 60日最低价 */
  low60: number;
}
export interface StockItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  /** 60日最高价 */
  high60: number;
  /** 60日最低价 */
  low60: number;
}

/**
 * 板块列表：中证行业指数（权威、覆盖广）+ 行业 ETF（补充未覆盖行业）
 * 去重原则：ETF 只保留中证指数未覆盖的行业
 */
const SECTOR_LIST: [string, string][] = [
  // ── 中证行业指数（10 只）──
  ["sz399986", "银行"],
  ["sz399975", "证券"],
  ["sh000932", "消费"],
  ["sh000933", "医药"],
  ["sh000934", "金融"],
  ["sz399967", "军工"],
  ["sh000935", "信息"],
  ["sz399966", "基础"],
  ["sz399997", "白酒"],
  ["sz399989", "食品"],
  // ── 行业 ETF（补充中证未覆盖行业）──
  ["sh515030", "新能源"],
  ["sh512480", "半导体"],
  ["sh515790", "光伏"],
  ["sh512200", "房地产"],
  ["sh515220", "煤炭"],
  ["sh512980", "传媒"],
  ["sh512660", "军工ETF"],
  ["sh512400", "有色"],
  ["sh512690", "酒ETF"],
  ["sz159996", "家电"],
  ["sz159825", "农业"],
  ["sh515880", "通信"],
  ["sh516950", "基建"],
  ["sh512280", "计算机"],
  ["sz159995", "芯片"],
];

/** 主要个股列表 */
const STOCK_LIST: [string, string][] = [
  ["sh601398", "工商银行"],
  ["sh601288", "农业银行"],
  ["sh601939", "建设银行"],
  ["sh600036", "招商银行"],
  ["sh601166", "兴业银行"],
  ["sh600030", "中信证券"],
  ["sh601688", "华泰证券"],
  ["sh600031", "三一重工"],
  ["sh601318", "中国平安"],
  ["sh601601", "中国太保"],
  ["sh600519", "贵州茅台"],
  ["sh000858", "五粮液"],
  ["sh600809", "山西汾酒"],
  ["sz000568", "泸州老窖"],
  ["sh600276", "恒瑞医药"],
  ["sz300760", "迈瑞医疗"],
  ["sh600196", "复星医药"],
  ["sz000538", "云南白药"],
  ["sh601012", "隆基绿能"],
  ["sz002475", "立讯精密"],
  ["sh600703", "三安光电"],
  ["sz000725", "京东方A"],
  ["sh688981", "中芯国际"],
  ["sz002230", "科大讯飞"],
  ["sh600585", "海螺水泥"],
  ["sz000651", "格力电器"],
  ["sz000333", "美的集团"],
  ["sh603259", "药明康德"],
  ["sz300750", "宁德时代"],
  ["sz002594", "比亚迪"],
  ["sh601899", "紫金矿业"],
  ["sh600028", "中国石化"],
  ["sh601088", "中国神华"],
  ["sh600583", "海油工程"],
  ["sz000002", "万科A"],
  ["sh600048", "保利发展"],
  ["sh600000", "浦发银行"],
  ["sh600016", "民生银行"],
  ["sh601818", "光大银行"],
  ["sh600015", "华夏银行"],
  ["sh601878", "浙商证券"],
  ["sh600999", "招商证券"],
  ["sh601211", "国泰君安"],
  ["sh600958", "东方证券"],
  ["sh600887", "伊利股份"],
  ["sh603288", "海天味业"],
  ["sz000661", "长春高新"],
  ["sz300122", "智飞生物"],
  ["sh600104", "上汽集团"],
  ["sz002415", "海康威视"],
  ["sh600309", "万华化学"],
  ["sz002601", "龙蟒佰利"],
  ["sh601633", "长城汽车"],
  ["sz000063", "中兴通讯"],
  ["sz300059", "东方财富"],
  ["sz002714", "牧原股份"],
  ["sh600690", "海尔智家"],
  ["sz000776", "广发证券"],
  ["sh601390", "中国中铁"],
  ["sh601186", "中国铁建"],
  ["sh600900", "长江电力"],
  ["sh600023", "浙能电力"],
  ["sh601985", "中国核电"],
  ["sh600050", "中国联通"],
  ["sh601728", "中国电信"],
  ["sh600267", "海正药业"],
  ["sz002352", "顺丰控股"],
  ["sh603993", "洛阳钼业"],
  ["sh601857", "中国石油"],
  ["sz002460", "赣锋锂业"],
  ["sh600547", "山东黄金"],
  ["sz000977", "浪潮信息"],
  ["sz300033", "同花顺"],
  ["sz002236", "大华股份"],
  ["sz300496", "中科创达"],
  ["sz002049", "紫光国微"],
  ["sh688012", "中微公司"],
  ["sz300782", "卓胜微"],
];

/**
 * 股票数据服务 —— 数据源: 腾讯财经 API
 *
 * 前一交易日同时刻成交额通过内存缓存获取：
 * 每次刷新将分时累计成交额按时刻索引缓存，次日切换为"昨日"数据，
 * 对比时查找昨日同一时刻的累计值，实现同时刻对比。
 */
export class StockDataService {
  /** 腾讯分时查询（上证指数，含行情 + 分时） */
  private static readonly SH_MINUTE_URL =
    "https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=sh000001";

  /** 腾讯实时报价（深证成指，用于获取深市成交额） */
  private static readonly SZ_QUOTE_URL = "https://qt.gtimg.cn/q=sz399001";

  /** 缓存：当日分时累计成交额，key="HH:MM"，value=累计成交额(元) */
  private todayTurnoverByTime = new Map<string, number>();
  /** 缓存：前一交易日分时累计成交额（由当日数据在日期切换时转入） */
  private prevDayTurnoverByTime = new Map<string, number>();
  /** 当前记录的交易日日期 */
  private recordedDate = "";
  /** 板块 60 日高低点缓存 */
  private sectorKlineCache = new Map<string, { high: number; low: number }>();
  /** 个股 60 日高低点缓存 */
  private stockKlineCache = new Map<string, { high: number; low: number }>();
  /** K 线缓存日期（每日只取一次 K 线） */
  private klineCacheDate = "";

  /**
   * 获取实时行情 + 分时数据
   */
  async fetchQuote(): Promise<StockQuote> {
    // 并行请求上证分时 + 深证实时
    const [shMinuteJson, szQuoteText] = await Promise.all([
      this.fetchJson(StockDataService.SH_MINUTE_URL),
      this.fetchText(StockDataService.SZ_QUOTE_URL),
    ]);

    // ── 上证行情 ──
    const shStock = shMinuteJson?.data?.sh000001;
    const shQt: string[] = shStock?.qt?.sh000001;
    if (!shQt || shQt.length < 35) {
      throw new Error("获取行情数据失败");
    }

    const price = this.num(shQt[3]);
    const prevClose = this.num(shQt[4]);
    const open = this.num(shQt[5]);
    const high = this.num(shQt[33]);
    const low = this.num(shQt[34]);
    const changeAmount = this.num(shQt[31]);
    // 沪市成交额: qt[37] 单位万元 → 元
    const shTurnover = this.num(shQt[37]) * 10000;

    // ── 深市成交额 ──
    const szTurnover = this.parseSzTurnover(szQuoteText) * 10000;

    // ── 两市合计 ──
    const turnover = shTurnover + szTurnover;

    // ── 分时数据 + 同时刻成交额缓存 ──
    const rawTrends: string[] = shStock?.data?.data ?? [];
    const trends = this.parseTrends(rawTrends);
    const prevTurnover = this.updateTurnoverCache(rawTrends);

    return {
      price,
      changePercent:
        prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      changeAmount,
      prevClose,
      open,
      high,
      low,
      turnover,
      prevTurnover,
      trends,
    };
  }

  /**
   * 获取板块与个股看板数据
   */
  async fetchBoardData(): Promise<BoardData> {
    const today = this.getBjDate();

    // 每日更新 K 线缓存（60日高低点变化缓慢，每天取一次即可）
    if (today !== this.klineCacheDate) {
      const allCodes = [
        ...SECTOR_LIST.map(([c]) => c),
        ...STOCK_LIST.map(([c]) => c),
      ];
      const klineData = await this.fetchKlineHighLow(allCodes, 60);
      for (const [code, hl] of klineData) {
        if (SECTOR_LIST.some(([c]) => c === code)) {
          this.sectorKlineCache.set(code, hl);
        } else {
          this.stockKlineCache.set(code, hl);
        }
      }
      this.klineCacheDate = today;
    }

    // 获取实时报价（腾讯 qt API）
    const [sectors, stocks] = await Promise.all([
      this.fetchBatchQuotes(SECTOR_LIST.map(([c]) => c)),
      this.fetchBatchQuotes(STOCK_LIST.map(([c]) => c)),
    ]);

    const sectorItems: SectorItem[] = [];
    for (const [code, name] of SECTOR_LIST) {
      const q = sectors.get(code);
      const hl = this.sectorKlineCache.get(code);
      if (q && hl) {
        sectorItems.push({
          code,
          name,
          price: q.price,
          changePercent: q.changePercent,
          high60: hl.high,
          low60: hl.low,
        });
      }
    }

    const stockItems: StockItem[] = [];
    const nameMap = new Map(STOCK_LIST);
    for (const [code] of STOCK_LIST) {
      const q = stocks.get(code);
      const hl = this.stockKlineCache.get(code);
      if (q && hl) {
        stockItems.push({
          code,
          name: nameMap.get(code) || code,
          price: q.price,
          changePercent: q.changePercent,
          high60: hl.high,
          low60: hl.low,
        });
      }
    }

    return {
      sectors: this.categorizeBoard(sectorItems),
      stocks: this.categorizeBoard(stockItems),
    };
  }

  /**
   * 更新分时成交额缓存，返回昨日同时刻累计成交额
   *
   * 每次刷新：
   * 1. 检测日期变化 → 若进入新交易日，将 today 转为 prevDay
   * 2. 将当前分时数据写入 todayTurnoverByTime
   * 3. 查找 prevDay 中当前时刻的累计成交额并返回
   */
  private updateTurnoverCache(rawTrends: string[]): number {
    const today = this.getBjDate();

    // 日期变化：today → prevDay
    if (today !== this.recordedDate) {
      if (this.todayTurnoverByTime.size > 0) {
        this.prevDayTurnoverByTime = new Map(this.todayTurnoverByTime);
      }
      this.todayTurnoverByTime.clear();
      this.recordedDate = today;
    }

    // 将当前分时数据写入 today 缓存
    for (const item of rawTrends) {
      const parts = item.split(" ");
      if (parts.length >= 4) {
        const time = parts[0];
        const cumTurnover = parseFloat(parts[3]);
        const formatted =
          time.length === 4 ? `${time.slice(0, 2)}:${time.slice(2)}` : time;
        this.todayTurnoverByTime.set(formatted, cumTurnover);
      }
    }

    // 查找昨日同时刻累计成交额
    const now = this.getBjTime();
    return this.findPrevTurnoverAt(now);
  }

  /**
   * 在昨日缓存中查找指定时刻（或最近时刻）的累计成交额
   * 精确匹配优先，找不到则取最近的历史时刻
   */
  private findPrevTurnoverAt(time: string): number {
    if (this.prevDayTurnoverByTime.size === 0) {
      return 0;
    }

    // 精确匹配
    const exact = this.prevDayTurnoverByTime.get(time);
    if (exact !== undefined) {
      return exact;
    }

    // 取最近时刻（昨日可能还没到当前时间）
    const sortedTimes = [...this.prevDayTurnoverByTime.keys()].sort();
    let closest = "";
    for (const t of sortedTimes) {
      if (t <= time) {
        closest = t;
      }
    }
    return closest ? (this.prevDayTurnoverByTime.get(closest) ?? 0) : 0;
  }

  /** 获取 N 日 K 线高低点（数据源: 新浪财经 API） */
  private async fetchKlineHighLow(
    codes: string[],
    days: number,
  ): Promise<Map<string, { high: number; low: number }>> {
    const result = new Map<string, { high: number; low: number }>();
    const today = this.getBjDate();
    // 多取几天以排除当天数据（新浪 K 线包含当天）
    const fetchLen = days + 5;
    // 并行请求所有 K 线（新浪 API 稳定、无限流）
    const promises = codes.map(async (code) => {
      try {
        const text = await this.fetchText(
          `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${code}&scale=240&ma=no&datalen=${fetchLen}`,
        );
        if (!text.startsWith("[")) return;
        const klines: Array<{
          day: string;
          open: string;
          high: string;
          low: string;
          close: string;
          volume: string;
        }> = JSON.parse(text);
        // 排除当天数据，用前 N 天计算高低点
        const prevDays = klines.filter((k) => k.day < today).slice(-days);
        if (prevDays.length > 0) {
          let high = -Infinity;
          let low = Infinity;
          for (const k of prevDays) {
            const h = parseFloat(k.high);
            const l = parseFloat(k.low);
            if (h > high) high = h;
            if (l < low) low = l;
          }
          if (high > 0 && low < Infinity) {
            result.set(code, { high, low });
          }
        }
      } catch {
        /* skip failed */
      }
    });
    await Promise.all(promises);
    return result;
  }

  /** 将板块/个股分为新高、新低、不创新低三组（基于 N 日高低点） */
  private categorizeBoard<
    T extends {
      price: number;
      changePercent: number;
      high60: number;
      low60: number;
    },
  >(items: T[]): { newHigh: T[]; newLow: T[]; noNewLow: T[] } {
    const newHigh: T[] = [],
      newLow: T[] = [],
      noNewLow: T[] = [];
    for (const item of items) {
      if (item.price >= item.high60 && item.high60 > 0) newHigh.push(item);
      else if (item.price <= item.low60 && item.low60 > 0) newLow.push(item);
      else if (item.changePercent < 0) noNewLow.push(item);
    }
    newHigh.sort((a, b) => b.changePercent - a.changePercent);
    newLow.sort((a, b) => a.changePercent - b.changePercent);
    noNewLow.sort((a, b) => b.changePercent - a.changePercent);
    return { newHigh, newLow, noNewLow };
  }

  /** 批量获取报价（腾讯 qt API），返回 Map<code, {price,changePercent,high,low}> */
  private async fetchBatchQuotes(
    codes: string[],
  ): Promise<
    Map<
      string,
      { price: number; changePercent: number; high: number; low: number }
    >
  > {
    const result = new Map<
      string,
      { price: number; changePercent: number; high: number; low: number }
    >();
    const pageSize = 60;
    for (let i = 0; i < codes.length; i += pageSize) {
      const batch = codes.slice(i, i + pageSize);
      try {
        const text = await this.fetchText(
          `https://qt.gtimg.cn/q=${batch.join(",")}`,
        );
        for (const line of text.split("\n")) {
          const parsed = this.parseQtLine(line);
          if (parsed) result.set(parsed.code, parsed.data);
        }
      } catch {
        /* skip failed batch */
      }
      if (i + pageSize < codes.length) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    return result;
  }

  /** 解析腾讯 qt API 单行数据 */
  private parseQtLine(line: string): {
    code: string;
    data: { price: number; changePercent: number; high: number; low: number };
  } | null {
    const m = line.match(/v_(\w+)="([^"]+)"/);
    if (!m) return null;
    const f = m[2].split("~");
    if (f.length < 35) return null;
    const price = this.num(f[3]);
    if (price <= 0) return null;
    return {
      code: m[1],
      data: {
        price,
        changePercent: this.num(f[32]),
        high: this.num(f[33]),
        low: this.num(f[34]),
      },
    };
  }

  /** 获取北京时间日期字符串 (YYYY-MM-DD) */
  private getBjDate(): string {
    const bj = this.getBjNow();
    const y = bj.getFullYear();
    const m = String(bj.getMonth() + 1).padStart(2, "0");
    const d = String(bj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /** 获取北京时间当前时刻字符串 ("HH:MM") */
  private getBjTime(): string {
    const bj = this.getBjNow();
    const h = String(bj.getHours()).padStart(2, "0");
    const m = String(bj.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  /** 获取北京时间 Date 对象 */
  private getBjNow(): Date {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
    return new Date(utc + 8 * 3600_000);
  }

  /**
   * 从腾讯 qt 文本中提取深证成指成交额（万元）
   * 格式: v_sz399001="字段0~字段1~...~字段37~..."
   */
  private parseSzTurnover(text: string): number {
    const match = text.match(/v_sz399001="([^"]+)"/);
    if (!match) {
      return 0;
    }
    const fields = match[1].split("~");
    return this.num(fields[37]);
  }

  /**
   * 解析腾讯分时数据
   * 原始格式: "HHMM 价格 累计成交量 累计成交额"（空格分隔）
   * 转换为:   [时间, 价格, 均价, 本分钟成交量]
   */
  private parseTrends(
    items: string[],
  ): Array<[string, number, number, number]> {
    const trends: Array<[string, number, number, number]> = [];
    let prevCumVol = 0;

    for (const item of items) {
      const parts = item.split(" ");
      if (parts.length >= 4) {
        const time = parts[0];
        const price = parseFloat(parts[1]);
        const cumVol = parseFloat(parts[2]);
        const cumTurnover = parseFloat(parts[3]);

        const avgPrice = cumVol > 0 ? cumTurnover / cumVol : price;
        const intervalVol = cumVol - prevCumVol;

        const formattedTime =
          time.length === 4 ? `${time.slice(0, 2)}:${time.slice(2)}` : time;

        trends.push([formattedTime, price, avgPrice, intervalVol]);
        prevCumVol = cumVol;
      }
    }
    return trends;
  }

  /** 发起 HTTPS GET 请求，返回 JSON */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => (body += chunk.toString()));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(new Error(`JSON 解析失败: ${(e as Error).message}`));
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("请求超时"));
      });
    });
  }

  /** 发起 HTTPS GET 请求，返回原始文本 */
  private fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => (body += chunk.toString()));
          res.on("end", () => resolve(body));
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("请求超时"));
      });
    });
  }

  /** 安全地将值转为数字 */
  private num(val: unknown): number {
    if (val === undefined || val === null || val === "-") {
      return 0;
    }
    return typeof val === "number" ? val : parseFloat(String(val)) || 0;
  }
}
