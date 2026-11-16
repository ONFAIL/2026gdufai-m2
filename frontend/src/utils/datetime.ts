const OFFSET_MS = 8 * 60 * 60 * 1000;

function pad2(num: number): string {
  return num < 10 ? `0${num}` : String(num);
}

function formatUtcMsAsPlus8(utcMs: number): string {
  const d = new Date(utcMs + OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  return `${y}-${m}-${day}T${h}:${min}:${s}+08:00`;
}

/**
 * 将时间字符串标准化为带 +08:00 偏移的 ISO-8601 字符串，缺失返回 null。
 * @param raw 原始时间字符串
 */
export function normalizeIsoOffset(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withSec = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    return `${withSec}+08:00`;
  }
  if (trimmed.endsWith('+08:00')) {
    return trimmed;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return formatUtcMsAsPlus8(parsed);
}

/**
 * 返回当前东八区时间（ISO-8601 +08:00），不产生 Z 结尾。
 */
export function nowIso(): string {
  return formatUtcMsAsPlus8(Date.now());
}

/**
 * 提取东八区 YYYY-MM-DD 日期键，缺失返回空串。
 * @param iso 时间字符串
 */
export function toDateKey(iso: string | null | undefined): string {
  const normalized = normalizeIsoOffset(iso);
  return normalized ? normalized.slice(0, 10) : '';
}

/**
 * 提取东八区 YYYY-MM 月份键，缺失返回空串。
 * @param iso 时间字符串
 */
export function toMonthKey(iso: string | null | undefined): string {
  const normalized = normalizeIsoOffset(iso);
  return normalized ? normalized.slice(0, 7) : '';
}

/**
 * 格式化展示用日期时间（YYYY-MM-DD HH:mm），缺失返回破折号。
 * @param iso 时间字符串
 */
export function fmtDateTime(iso: string | null | undefined): string {
  const normalized = normalizeIsoOffset(iso);
  if (!normalized) {
    return '—';
  }
  return `${normalized.slice(0, 10)} ${normalized.slice(11, 16)}`;
}

/**
 * 格式化展示用日期（YYYY-MM-DD），缺失返回破折号。
 * @param iso 时间字符串
 */
export function fmtDate(iso: string | null | undefined): string {
  const normalized = normalizeIsoOffset(iso);
  return normalized ? normalized.slice(0, 10) : '—';
}

/**
 * 转换为原生 datetime-local 输入框所需值（YYYY-MM-DDTHH:mm）。
 * @param iso 时间字符串
 */
export function toDatetimeLocal(iso: string | null | undefined): string {
  const normalized = normalizeIsoOffset(iso);
  return normalized ? normalized.slice(0, 16) : '';
}

/**
 * 生成以基准日为终点的连续 7 天升序日期键（YYYY-MM-DD）。
 * @param anchorDateKey 基准日期键（YYYY-MM-DD）
 */
export function recent7Keys(anchorDateKey: string): string[] {
  const parts = anchorDateKey.split('-');
  const y = Number(parts[0] ?? 2026);
  const m = Number(parts[1] ?? 11) - 1;
  const d = Number(parts[2] ?? 16);
  const anchorMs = Date.UTC(y, m, d);
  const keys: string[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dt = new Date(anchorMs - offset * 86_400_000);
    keys.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`);
  }
  return keys;
}
