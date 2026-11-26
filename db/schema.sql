-- Spendly PostgreSQL Schema
-- Firebase Authentication provides the user's unique UID.
-- All expense and budget records are stored in PostgreSQL scoped by uid.

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  category VARCHAR(60) NOT NULL,
  date DATE NOT NULL,
  payment_method VARCHAR(40) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_uid_date
  ON expenses (uid, date DESC, id DESC);

CREATE TABLE IF NOT EXISTS budgets (
  uid TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  daily NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (daily >= 0),
  weekly NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (weekly >= 0),
  monthly NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (monthly >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
