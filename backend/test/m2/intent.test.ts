import { describe, expect, it } from 'vitest';
import { detectSpecialEntry } from '../../src/modules/ledger/intent.ts';

describe('退款/还款意图识别', () => {
  it('识别退款相关文本', () => {
    for (const text of ['退款 50', '昨天买的鞋退货了', '订单退差价 20', '会员卡退费']) {
      expect(detectSpecialEntry(text)).toBe('refund');
    }
  });

  it('识别还款相关文本', () => {
    for (const text of ['还款 1000', '这个月还贷 3000', '提前偿还借款', '分期还款 200']) {
      expect(detectSpecialEntry(text)).toBe('repayment');
    }
  });

  it('普通消费不误判', () => {
    for (const text of ['瑞幸 32.5', '工资到账 8000', '超市买菜 45']) {
      expect(detectSpecialEntry(text)).toBeNull();
    }
  });
});
