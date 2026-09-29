import * as https from "https";
import * as http from "http";
import { createV } from "pay-back-core";

/** 指数行情 + 两市成交额（fuyao 图表 + THS 现价快照） */
export interface StockQuote {
  /** 上证指数当前点位 */
  price: number;
  /** 上证指数涨跌幅 (%) */
  changePercent: number;
  /** 上证指数涨跌额 */
  changeAmount: number;
  /** 昨日收盘点位 */
  prevClose: number;
  /** 今日开盘点位 */
  open: number;
  /** 今日最高点位 */
  high: number;
  /** 今日最低点位 */
  low: number;
  /** 两市当日累计成交额（元） */
  turnover: number;
  /** 昨日同时刻累计成交额（元） */
  prevTurnover: number;
  /** 较昨日变动（元，正=放量/红，负=缩量/绿） */
  turnoverChange: number;
  /** 预测全天成交额（元） */
  predictTurnover: number;
  /** 近5日平均成交额（元） */
  avgTurnover5: number;
  /** 近60日平均成交额（元） */
  avgTurnover60: number;
  /** 分时数据: [时间, 当日累计成交额, 昨日同时刻累计成交额, 当日-昨日差]（元） */
  trends: Array<[string, number, number, number]>;
  /** 上证指数分时点位: [时间, 点位] */
  indexTrends: Array<[string, number]>;
}

/** 看板模块归属（用户自定义看板归属到「板块」或「个股」模块展示） */
export type BoardModule = "sector" | "stock";

/** 板块看板数据 */
export interface BoardData {
  sectors: {
    newHigh: BoardItem[];
    newLow: BoardItem[];
    notNewLow: BoardItem[];
  };
  stocks: {
    newHigh: BoardItem[];
    newLow: BoardItem[];
    notNewLow: BoardItem[];
  };
  /** 用户自定义看板列表 */
  custom: Array<{ title: string; items: BoardItem[]; module?: BoardModule }>;
}
export interface BoardItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
}

/** 用户自定义看板（问句管理页增删改） */
export interface CustomBoard {
  /** 稳定唯一 id（用于编辑/删除定位） */
  id: string;
  /** 看板显示名称 */
  name: string;
  /** 爱问财问答语句 */
  question: string;
  /** 归属模块：板块/个股（决定在板块区域还是个股区域展示） */
  module?: BoardModule;
}

/** 看板问答语句（可通过设置页管理） */
export interface BoardQueries {
  /** 板块新高问句 */
  sectorHigh: string;
  /** 板块新低问句 */
  sectorLow: string;
  /** 板块不创新低问句 */
  sectorNotNewLow: string;
  /** 个股新高问句 */
  stockHigh: string;
  /** 个股新低问句 */
  stockLow: string;
  /** 个股不创新低问句 */
  stockNotNewLow: string;
}

/** 看板问答语句默认值 */
export const DEFAULT_BOARD_QUERIES: BoardQueries = {
  sectorHigh: "同花顺行业新高",
  sectorLow: "同花顺行业新低",
  sectorNotNewLow: "同花顺行业未创新低",
  stockHigh: "创60日新高的个股 非ST",
  stockLow: "创60日新低的个股 非ST",
  stockNotNewLow: "未创60日新低的个股 非ST",
};

/** fuyao 图表接口返回的单个图表 */
interface FuyaoChart {
  total?: number;
  name?: string;
  header?: Array<{ val?: number; name?: string; key?: string }>;
  point_list?: Array<Array<number | null>>;
}

/**
 * 股票数据服务
 *
 * 数据源:
 * - 同花顺 fuyao 图表接口 (dq.10jqka.com.cn): 两市成交额分时 + 成交额对比
 * - 爱问财 (iwencai.com): 新高/新低板块&个股查询
 *
 * 认证: 爱问财请求携带 hexin-v 请求头（同花顺 Chameleon 指纹令牌）
 */
export class StockDataService {
  /** 同花顺 fuyao 图表 API（市场成交额分时 / 日K对比） */
  private static readonly FUYAO_CHART_BASE =
    "https://dq.10jqka.com.cn/fuyao/market_analysis_api/chart/v1/get_chart_data";
  /** 同花顺指数分时线（现价/昨收/开高低实时快照） */
  private static readonly THS_SPOT_BASE =
    "http://d.10jqka.com.cn/v6/time";

  /** 爱问财 API */
  private static readonly IWC_URL =
    "https://www.iwencai.com/unifiedwap/unified-wap/v2/result/get-robot-data";

  /**
   * 获取两市成交额分时 + 成交额对比
   * 数据源: 同花顺 fuyao 图表接口
   * - chart_key=turnover_minute: 市场成交额分时（当日/昨日同时刻累计 + 差值）
   * - chart_key=turnover_day: 市场成交额日K（当日 vs 近60日均值）
   */
  async fetchQuote(signal?: AbortSignal): Promise<StockQuote> {
    const [spot, minute, day] = await Promise.all([
      this.fetchThsSpot(signal),
      this.fetchFuyaoChart("turnover_minute", signal),
      this.fetchFuyaoChart("turnover_day", signal),
    ]);

    // header: [{key:"turnover", name:"当日成交额", val}, ...]
    const mHeader = this.chartHeaderMap(minute);
    const dHeader = this.chartHeaderMap(day);

    // 当日/昨日成交额优先取 header；缺失时退回分时末点
    const turnover = mHeader.get("turnover") ?? this.lastValue(minute, 1);
    const prevTurnover = mHeader.get("turnover_pre") ?? this.lastValue(minute, 2);
    const turnoverChange = mHeader.get("turnover_change") ?? turnover - prevTurnover;
    const predictTurnover = mHeader.get("predict_turnover") ?? 0;

    // 分时数据: [ts, 当日累计, 昨日同时刻累计, 当日-昨日差]（元）
    const trends: Array<[string, number, number, number]> = [];
    for (const p of minute.point_list ?? []) {
      if (!Array.isArray(p) || p.length < 4) continue;
      const ts = p[0];
      const today = this.num(p[1]);
      const yest = this.num(p[2]);
      const diff = this.num(p[3]);
      if (typeof ts !== "number" || !(ts > 0) || (!(today > 0) && !(yest > 0))) continue;
      trends.push([this.formatBjTime(ts), today, yest, diff]);
    }

    return {
      price: spot.price,
      changePercent: spot.prevClose !== 0
        ? ((spot.price - spot.prevClose) / spot.prevClose) * 100
        : 0,
      changeAmount: spot.price - spot.prevClose,
      prevClose: spot.prevClose,
      open: spot.open,
      high: spot.high,
      low: spot.low,
      turnover,
      prevTurnover,
      turnoverChange,
      predictTurnover,
      avgTurnover5: this.avgLastNDays(day, 5),
      avgTurnover60: dHeader.get("average_turnover") ?? this.avgLastNDays(day, 60),
      trends,
      indexTrends: spot.indexTrends,
    };
  }

  /**
   * 获取板块与个股新高/新低看板数据
   * 数据源: 爱问财自然语言查询；问答语句由设置页管理
   */
  async fetchBoardData(
    queries: BoardQueries,
    custom: CustomBoard[] = [],
  ): Promise<BoardData> {
    const [
      sectorHigh,
      sectorLow,
      sectorNotNewLow,
      stockHigh,
      stockLow,
      stockNotNewLow,
      customLists,
    ] = await Promise.all([
      this.fetchBoardItems(queries.sectorHigh, true),
      this.fetchBoardItems(queries.sectorLow, true),
      this.fetchBoardItems(queries.sectorNotNewLow, true),
      this.fetchBoardItems(queries.stockHigh, false),
      this.fetchBoardItems(queries.stockLow, false),
      this.fetchBoardItems(queries.stockNotNewLow, false),
      Promise.all(
        custom.map(async (cb) => ({
          title: cb.name,
          items: await this.fetchBoardItems(cb.question, false),
          module: cb.module,
        })),
      ),
    ]);

    return {
      sectors: {
        newHigh: sectorHigh,
        newLow: sectorLow,
        notNewLow: sectorNotNewLow,
      },
      stocks: {
        newHigh: stockHigh,
        newLow: stockLow,
        notNewLow: stockNotNewLow,
      },
      custom: customLists,
    };
  }

  // ────────────────────────────────────────────
  //  同花顺 fuyao 图表接口
  // ────────────────────────────────────────────

  /**
   * 请求 fuyao 图表接口
   * 响应: { status_code, data: { charts: { header, point_list } } }
   */
  private async fetchFuyaoChart(
    chartKey: string,
    signal?: AbortSignal,
  ): Promise<FuyaoChart> {
    const url = `${StockDataService.FUYAO_CHART_BASE}?chart_key=${chartKey}`;
    const text = await this.fetchHttp(
      url,
      this.fuyaoHeaders(),
      undefined,
      undefined,
      signal,
    );
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`fuyao 接口返回非法 JSON: ${chartKey}`);
    }
    if (typeof json !== "object" || json === null) {
      throw new Error(`fuyao 接口无数据: ${chartKey}`);
    }
    const data = (json as Record<string, unknown>).data;
    const charts =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>).charts
        : undefined;
    if (typeof charts !== "object" || charts === null) {
      throw new Error(`fuyao 接口无 charts: ${chartKey}`);
    }
    return charts as FuyaoChart;
  }

  /** header 数组转 key → val 映射 */
  private chartHeaderMap(chart: FuyaoChart): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of chart.header ?? []) {
      if (item?.key && typeof item.val === "number") {
        map.set(item.key, item.val);
      }
    }
    return map;
  }

  /** 取 point_list 中最后一列非空值（列序号 1/2/…） */
  private lastValue(chart: FuyaoChart, idx: number): number {
    for (let i = (chart.point_list?.length ?? 0) - 1; i >= 0; i--) {
      const p = chart.point_list?.[i];
      const v = p?.[idx];
      if (typeof v === "number" && v > 0) return v;
    }
    return 0;
  }

  /** 最近 N 个交易日成交额平均值（元） */
  private avgLastNDays(chart: FuyaoChart, n: number): number {
    const values: number[] = [];
    for (const p of chart.point_list ?? []) {
      const v = p?.[1];
      if (typeof v === "number" && v > 0) values.push(v);
    }
    const recent = values.slice(-n);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, v) => sum + v, 0) / recent.length;
  }

  /** 时间戳（ms）→ 北京时间 HH:MM */
  private formatBjTime(tsMs: number): string {
    const bj = new Date(tsMs + 8 * 3600_000);
    const hh = String(bj.getUTCHours()).padStart(2, "0");
    const mm = String(bj.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  /**
   * 请求上证指数分时线 JSONP，取实时快照 + 指数分时点位序列
   * 响应格式: quotebridge_v6_time_zs_1A0001_last({JSON})
   * 响应结构: { zs_1A0001: { pre: 昨收, open, data: "HHMM,price,…", isTrading } }
   */
  private async fetchThsSpot(signal?: AbortSignal): Promise<{
    price: number;
    prevClose: number;
    open: number;
    high: number;
    low: number;
    /** 指数分时点位: [时间, 点位] */
    indexTrends: Array<[string, number]>;
  }> {
    const url = `${StockDataService.THS_SPOT_BASE}/zs_1A0001/last.js`;
    const text = await this.fetchHttp(url, this.thsSpotHeaders(), undefined, undefined, signal);
    const start = text.indexOf("(");
    const end = text.lastIndexOf(")");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("同花顺指数 JSONP 解析失败: 1A0001");
    }
    const json = JSON.parse(text.substring(start + 1, end)) as Record<string, unknown>;
    const obj = json["zs_1A0001"] ?? json["hs_1A0001"];
    if (typeof obj !== "object" || obj === null) {
      throw new Error("同花顺指数 API 无数据: 1A0001");
    }
    const o = obj as Record<string, unknown>;

    const prevClose = this.num(o.pre ?? o.prevClose);
    let open = this.num(o.open);
    let price = 0;
    let high = 0;
    let low = 0;
    const indexTrends: Array<[string, number]> = [];

    for (const seg of String(o.data ?? "").split(";")) {
      const parts = seg.split(",");
      if (parts.length < 2) continue;
      const p = parseFloat(parts[1]);
      if (!(p > 0)) continue;
      const timeRaw = parts[0];
      const time =
        timeRaw.length === 4
          ? `${timeRaw.slice(0, 2)}:${timeRaw.slice(2)}`
          : timeRaw;
      if (open === 0) open = p;
      price = p;
      indexTrends.push([time, p]);
      high = Math.max(high, p);
      low = low === 0 ? p : Math.min(low, p);
    }

    return { price, prevClose, open, high, low, indexTrends };
  }

  // ────────────────────────────────────────────
  //  爱问财 API
  // ────────────────────────────────────────────

  /**
   * 爱问财通用查询
   * POST https://www.iwencai.com/unifiedwap/unified-wap/v2/result/get-robot-data
   * 注意：该接口需要表单编码（application/x-www-form-urlencoded），JSON 编码会被拒
   */
  private async fetchIwencai(
    question: string,
    pageSize = 100,
    isPlate = false,
  ): Promise<unknown[]> {
    const body = new URLSearchParams({
      source: "Ths_iwencai_Xuangu",
      version: "2.0",
      question,
      perpage: String(pageSize),
      page: "1",
      secondary_intent: isPlate ? "zhishu" : "stock",
      query_area: "",
      block_list: "",
      log_info: JSON.stringify({ input_type: "typewrite" }),
      add_info: JSON.stringify({
        urp: { scene: 1, company: 1, business: 1 },
        contentType: "json",
        searchInfo: true,
      }),
      source_from: "self",
    });

    const text = await this.fetchHttp(
      StockDataService.IWC_URL,
      this.iwcHeaders(),
      body.toString(),
      "POST",
    );

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return [];
    }
    return this.extractIwencaiData(json);
  }

  /**
   * 从爱问财响应中提取数据列表
   * 路径: data.answer[0].txt[0].content.components[0].data.datas
   */
  private extractIwencaiData(json: unknown): unknown[] {
    if (typeof json !== "object" || json === null) return [];
    const data = (json as Record<string, unknown>).data;
    if (typeof data !== "object" || data === null) return [];
    const answer = (data as Record<string, unknown>).answer;
    if (!Array.isArray(answer) || answer.length === 0) return [];
    const txt = (answer[0] as Record<string, unknown> | null)?.txt;
    if (!Array.isArray(txt) || txt.length === 0) return [];
    const content = (txt[0] as Record<string, unknown> | null)?.content;
    if (typeof content !== "object" || content === null) return [];
    const components = (content as Record<string, unknown>).components;
    if (!Array.isArray(components) || components.length === 0) return [];
    const compData = (components[0] as Record<string, unknown> | null)?.data;
    if (typeof compData !== "object" || compData === null) return [];
    const datas = (compData as Record<string, unknown>).datas;
    return Array.isArray(datas) ? datas : [];
  }

  /** 从记录中按精确键名取字符串 */
  private pickString(
    item: Record<string, unknown>,
    exact: string[],
  ): string {
    for (const key of exact) {
      const v = item[key];
      if (typeof v === "string" && v) return v;
    }
    return "";
  }

  /** 从记录中按精确键名或键名包含某子串取数值（兼容带日期的动态列名） */
  private pickNum(
    item: Record<string, unknown>,
    exact: string[],
    contains?: string[],
  ): number {
    for (const key of exact) {
      const v = item[key];
      if (v !== undefined && v !== null && v !== "-") {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        if (!Number.isNaN(n)) return n;
      }
    }
    if (contains) {
      for (const key of Object.keys(item)) {
        if (contains.some((c) => key.includes(c))) {
          const v = item[key];
          if (v !== undefined && v !== null && v !== "-") {
            const n = typeof v === "number" ? v : parseFloat(String(v));
            if (!Number.isNaN(n)) return n;
          }
        }
      }
    }
    return 0;
  }

  /**
   * 通过爱问财查询新高/新低板块或个股列表
   * 字段名随接口版本变化（如 "指数@涨跌幅:前复权[20260924]"），
   * 因此按键名精确匹配 + 子串匹配双保险提取
   */
  private async fetchBoardItems(
    question: string,
    isPlate: boolean,
  ): Promise<BoardItem[]> {
    try {
      const datas = await this.fetchIwencai(question, 50, isPlate);
      const items: BoardItem[] = [];
      for (const raw of datas) {
        if (typeof raw !== "object" || raw === null) continue;
        const item = raw as Record<string, unknown>;
        const name = this.pickString(item, [
          "股票简称",
          "指数简称",
          "板块名称",
          "行业名称",
          "名称",
          "name",
        ]);
        if (!name) continue;
        const code = this.pickString(item, [
          "股票代码",
          "指数代码",
          "行业代码",
          "板块代码",
          "代码",
          "code",
        ]);
        const price = this.pickNum(item, ["最新价", "收盘价"], ["收盘价"]);
        const changePercent = this.pickNum(
          item,
          ["最新涨跌幅", "涨跌幅", "涨幅(%)", "涨幅"],
          ["涨跌幅"],
        );
        items.push({ code, name, price, changePercent });
      }
      return items;
    } catch (err) {
      console.warn(`[stock-ticker] 爱问财看板查询失败: ${question}`, err);
      return [];
    }
  }

  // ────────────────────────────────────────────
  //  请求头
  // ────────────────────────────────────────────

  /** fuyao 图表接口请求头 */
  private fuyaoHeaders(): Record<string, string> {
    return {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
      Referer: "https://www.10jqka.com.cn/",
    };
  }

  /** 同花顺指数分时线请求头 */
  private thsSpotHeaders(): Record<string, string> {
    return {
      accept: "*/*",
      "accept-language": "zh-CN,zh;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
      Referer: "http://q.10jqka.com.cn/",
    };
  }

  /** 爱问财请求头（含 hexin-v 令牌） */
  private iwcHeaders(): Record<string, string> {
    return {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/x-www-form-urlencoded",
      "hexin-v": createV(),
      pragma: "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
      Referer: "https://www.iwencai.com/",
      Origin: "https://www.iwencai.com",
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  // ────────────────────────────────────────────
  //  HTTP 请求（支持 HTTP + HTTPS）
  // ────────────────────────────────────────────

  /** 通用 HTTP/HTTPS 请求 */
  private fetchHttp(
    url: string,
    headers?: Record<string, string>,
    body?: string,
    method?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const mod = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: method || "GET",
        headers: headers || {},
        timeout: 10000,
      };

      const onAbort = () => {
        req.destroy();
        reject(new Error(`请求已取消: ${url}`));
      };

      const req = mod.request(options, (res) => {
        if (
          res.statusCode &&
          (res.statusCode < 200 || res.statusCode >= 300)
        ) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve(data));
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`请求超时: ${url}`));
      });

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      if (body) req.write(body);
      req.end();
    });
  }

  // ────────────────────────────────────────────
  //  工具方法
  // ────────────────────────────────────────────

  /** 安全地将值转为数字 */
  private num(val: unknown): number {
    if (val === undefined || val === null || val === "-") {
      return 0;
    }
    return typeof val === "number" ? val : parseFloat(String(val)) || 0;
  }
}
