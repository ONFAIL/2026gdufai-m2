import { describe, expect, it } from 'vitest';
import { nowIsoShanghai, toShanghaiDate, todayShanghai } from '../../src/shared/time.ts';

describe('time', () => {
  it('按亚洲/上海取本地日期', () => {
    expect(toShanghaiDate('2026-11-14T00:30:00+08:00')).toBe('2026-11-14');
    expect(toShanghaiDate('2026-11-13T16:30:00Z')).toBe('2026-11-14');
  });

  it('UTC 时间跨日时归到上海日期', () => {
    expect(toShanghaiDate('2026-11-13T15:59:59Z')).toBe('2026-11-13');
    expect(toShanghaiDate('2026-11-13T16:00:00Z')).toBe('2026-11-14');
  });

  it('无法解析的时间报错', () => {
    expect(() => toShanghaiDate('not-a-date')).toThrow(RangeError);
  });

  it('输出带 +08:00 偏移', () => {
    const now = new Date('2026-11-15T00:00:00Z');
    expect(nowIsoShanghai(now)).toBe('2026-11-15T08:00:00+08:00');
    expect(todayShanghai(now)).toBe('2026-11-15');
  });
});
