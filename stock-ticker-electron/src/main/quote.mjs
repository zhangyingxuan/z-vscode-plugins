export function isMarketOpen(now = new Date()) {
  // 用 UTC 读取偏移后的时间，避免桌面系统时区影响交易时段。
  const beijing = new Date(now.getTime() + 8 * 3_600_000);
  const day = beijing.getUTCDay();
  const time = beijing.getUTCHours() * 100 + beijing.getUTCMinutes();
  return day > 0 && day < 6 && ((time >= 915 && time <= 1135) || (time >= 1255 && time <= 1505));
}

export function formatTurnover(amount) {
  // 成交额沿用插件的元、万、亿切换规则。
  if (amount >= 1e8) return (amount / 1e8).toFixed(2) + ' 亿';
  if (amount >= 1e4) return (amount / 1e4).toFixed(0) + ' 万';
  return amount.toFixed(0) + ' 元';
}

export function formatPercent(value) {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

export function formatVolumeChange(value) {
  // 缩放量独立着色，方向以取整前的成交额差为准。
  const volumeDirection = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return { volume: (Math.abs(value) / 1e8).toFixed(0), volumeDirection };
}

export function formatQuote(quote) {
  const { price, changePercent, turnoverChange, turnover } = quote;
  // 点位和涨跌幅沿用相对昨收的涨跌配色。
  const direction = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat';
  const { volume, volumeDirection } = formatVolumeChange(turnoverChange);
  return {
    direction, price: price.toFixed(2),
    percent: formatPercent(changePercent),
    volume: turnoverChange === 0 ? '' : volume, volumeDirection, turnover: formatTurnover(turnover),
  };
}
