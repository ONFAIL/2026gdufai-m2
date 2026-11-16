-- 模块 2 / 模块 4 共用数据模型 v1
-- 金额一律整数「分」；时间存 ISO-8601（+08:00）并冗余本地日期 occurred_date

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  nickname   TEXT NOT NULL,
  timezone   TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  currency   TEXT NOT NULL DEFAULT 'CNY',
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('expense', 'income')),
  keywords   TEXT    NOT NULL DEFAULT '[]',
  color      TEXT    NOT NULL DEFAULT '#6B7280',
  icon       TEXT    NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_preset  INTEGER NOT NULL DEFAULT 0 CHECK (is_preset IN (0, 1)),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT    NOT NULL,
  UNIQUE (kind, name)
);

CREATE TABLE user_category_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern      TEXT    NOT NULL,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  hit_count    INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT    NOT NULL,
  UNIQUE (user_id, pattern)
);

CREATE TABLE transactions (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id),
  direction           TEXT    NOT NULL CHECK (direction IN ('expense', 'income')),
  direction_source    TEXT    NOT NULL CHECK (direction_source IN ('explicit', 'category')),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  merchant            TEXT    NOT NULL,
  note                TEXT,
  occurred_at         TEXT    NOT NULL,
  occurred_date       TEXT    NOT NULL,
  time_source         TEXT    NOT NULL DEFAULT 'explicit'
                      CHECK (time_source IN ('explicit', 'chat_time')),
  chat_at             TEXT,
  category_id         INTEGER REFERENCES categories(id),
  category_source     TEXT    CHECK (category_source IN
                        ('rule', 'user_rule', 'llm', 'fallback', 'manual')),
  category_confidence REAL,
  status              TEXT    NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed', 'void')),
  source_modality     TEXT    NOT NULL
                      CHECK (source_modality IN ('text', 'voice', 'image', 'csv')),
  source_ref          TEXT,
  anomaly_flag        INTEGER NOT NULL DEFAULT 0 CHECK (anomaly_flag IN (0, 1)),
  anomaly_reason      TEXT,
  idempotency_key     TEXT    NOT NULL UNIQUE,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE INDEX idx_tx_user_date ON transactions (user_id, occurred_date);
CREATE INDEX idx_tx_user_category_date ON transactions (user_id, category_id, occurred_date);
CREATE INDEX idx_tx_status ON transactions (status);

CREATE TABLE budgets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month            TEXT    NOT NULL,
  scope            TEXT    NOT NULL CHECK (scope IN ('total', 'category')),
  category_id      INTEGER REFERENCES categories(id),
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  alert_thresholds TEXT    NOT NULL DEFAULT '[80,100]',
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  CHECK ((scope = 'total' AND category_id IS NULL)
      OR (scope = 'category' AND category_id IS NOT NULL))
);

CREATE UNIQUE INDEX ux_budget_scope
  ON budgets (user_id, month, scope, ifnull(category_id, 0));

CREATE TABLE budget_alerts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id    INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  threshold    INTEGER NOT NULL CHECK (threshold BETWEEN 1 AND 200),
  spent_cents  INTEGER NOT NULL,
  channel      TEXT    NOT NULL DEFAULT 'log',
  delivered    INTEGER NOT NULL DEFAULT 0 CHECK (delivered IN (0, 1)),
  triggered_at TEXT    NOT NULL,
  UNIQUE (budget_id, threshold)
);

CREATE TABLE intake_log (
  idempotency_key TEXT    PRIMARY KEY,
  record_id       TEXT    NOT NULL,
  batch_id        TEXT,
  status          TEXT    NOT NULL CHECK (status IN
                    ('confirmed', 'pending_followup', 'rejected', 'duplicate')),
  followup_round  INTEGER NOT NULL DEFAULT 0,
  transaction_id  TEXT,
  last_codes      TEXT    NOT NULL DEFAULT '[]',
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);
