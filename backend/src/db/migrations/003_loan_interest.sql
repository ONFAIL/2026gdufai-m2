-- v1.5：贷款利息类别 13、原账单结清标记
-- 1) transactions 增加 settled_at（原贷款结清时间，可空）
-- 2) 若 13 已被自定义类别占用，先整体迁移到 MAX(id)+1，再插入预设 13
ALTER TABLE transactions ADD COLUMN settled_at TEXT;

PRAGMA defer_foreign_keys = ON;

CREATE TEMP TABLE _preset13_migration AS
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM categories WHERE id = 13 AND is_preset = 0)
    THEN (SELECT COALESCE(MAX(id), 12) + 1 FROM categories)
  ELSE 13
END AS new_id;

UPDATE categories
   SET id = (SELECT new_id FROM _preset13_migration)
 WHERE id = 13 AND is_preset = 0;

UPDATE transactions
   SET category_id = (SELECT new_id FROM _preset13_migration)
 WHERE category_id = 13;

UPDATE budgets
   SET category_id = (SELECT new_id FROM _preset13_migration)
 WHERE category_id = 13;

UPDATE user_category_rules
   SET category_id = (SELECT new_id FROM _preset13_migration)
 WHERE category_id = 13;

INSERT OR IGNORE INTO categories
  (id, name, kind, keywords, color, icon, sort_order, is_preset, is_active, created_at)
VALUES
  (13, '贷款利息', 'expense',
   '["贷款利息","借款利息","房贷利息","还款利息","利息支出","分期利息"]',
   '#6366F1', '🧾', 13, 1, 1, '2026-11-19T00:00:00+08:00');

DROP TABLE _preset13_migration;
