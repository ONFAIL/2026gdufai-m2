/**
 * 将整数分格式化为人民币展示文本，缺失值返回破折号。
 * @param cents 整数分值
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) {
    return '—';
  }
  const sign = cents < 0 ? '-' : '';
  const absYuan = (Math.abs(Math.round(cents)) / 100).toFixed(2);
  return `${sign}¥${absYuan}`;
}

/**
 * 将整数分转换为表单输入框使用的元字符串，缺失返回空串。
 * @param cents 整数分值
 */
export function toYuanInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) {
    return '';
  }
  return (Math.round(cents) / 100).toFixed(2);
}

/**
 * 将整数分转换为入站契约 amount 所需的元数值，缺失返回 null。
 * @param cents 整数分值
 */
export function centsToYuanNumber(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined || Number.isNaN(cents)) {
    return null;
  }
  return Math.round(cents) / 100;
}

/**
 * 解析用户输入的元字符串为整数分，空串或非法值返回 null。
 * @param input 用户输入金额文本
 */
export function yuanToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}
