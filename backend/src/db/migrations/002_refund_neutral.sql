-- 退款/还款账单：保留记录但标记为中性，不计入收支统计
ALTER TABLE transactions ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'normal'
  CHECK (entry_type IN ('normal', 'refund', 'repayment'));

-- 匹配到的原账单 id；为空表示未匹配
ALTER TABLE transactions ADD COLUMN matched_transaction_id TEXT;

CREATE INDEX idx_tx_user_entry_date ON transactions (user_id, entry_type, occurred_date);
