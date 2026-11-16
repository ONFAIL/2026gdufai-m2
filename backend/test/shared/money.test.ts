import { describe, expect, it } from 'vitest';
import { centsToYuan, formatCents, yuanToCents } from '../../src/shared/money.ts';

describe('money', () => {
  it('元转分保留两位小数', () => {
    expect(yuanToCents(32.5)).toBe(3250);
    expect(yuanToCents(0.1)).toBe(10);
    expect(yuanToCents(0.01)).toBe(1);
  });

  it('超过两位小数直接报错，不静默取整', () => {
    expect(() => yuanToCents(12.345)).toThrow(RangeError);
  });

  it('非有限数字报错', () => {
    expect(() => yuanToCents(Number.NaN)).toThrow(RangeError);
  });

  it('分转元与格式化', () => {
    expect(centsToYuan(3250)).toBe(32.5);
    expect(formatCents(3250)).toBe('32.50');
    expect(formatCents(5)).toBe('0.05');
  });
});
