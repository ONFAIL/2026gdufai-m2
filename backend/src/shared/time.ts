/** 上海时区固定 UTC+8，无夏令时。 */
export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把任意可解析时间转成上海本地日期（YYYY-MM-DD），统计口径字段用它。 */
export function toShanghaiDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    throw new RangeError(`无法解析时间: ${iso}`);
  }
  return new Date(time + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 当前时刻的 ISO-8601 字符串，带 +08:00 偏移（不含毫秒）。 */
export function nowIsoShanghai(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

/** 上海时区的今天，YYYY-MM-DD。 */
export function todayShanghai(now: Date = new Date()): string {
  return toShanghaiDate(now.toISOString());
}
