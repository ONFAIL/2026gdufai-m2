import { describe, expect, it } from 'vitest';
import { isRefund } from '../../src/modules/ledger/intent.ts';

describe('isRefund', () => {
  it('识别退款相关文本', () => {
    for (const text of ['退款 50', '昨天买的鞋退货了', '订单退差价 20', '会员卡退费']) {
      expect(isRefund(text)).toBe(true);
    }
  });

  it('普通消费不误判', () => {
    for (const text of ['瑞幸 32.5', '工资到账 8000', '超市买菜 45']) {
      expect(isRefund(text)).toBe(false);
    }
  });
});
