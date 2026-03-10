-- Supabase 테이블 스키마
-- 실행: Supabase 대시보드 → SQL Editor에서 실행

-- 1. profiles 테이블
CREATE TABLE profiles (
  id text PRIMARY KEY,
  name text NOT NULL,
  strategy text NOT NULL,
  description text,
  rebalance_frequency_days int NOT NULL,
  risk_tolerance text NOT NULL,
  analysis_criteria jsonb DEFAULT '[]'::jsonb,
  investment_style jsonb DEFAULT '{}'::jsonb
);

-- 2. portfolios 테이블
CREATE TABLE portfolios (
  investor_id text PRIMARY KEY REFERENCES profiles(id),
  investor text NOT NULL,
  strategy text NOT NULL,
  initial_capital int NOT NULL DEFAULT 5000000,
  cash int NOT NULL DEFAULT 5000000,
  holdings jsonb DEFAULT '{}'::jsonb,
  last_rebalanced date
);

-- 3. transactions 테이블
CREATE TABLE transactions (
  id serial PRIMARY KEY,
  investor_id text NOT NULL REFERENCES profiles(id),
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('buy', 'sell')),
  ticker text NOT NULL,
  name text NOT NULL,
  shares int NOT NULL,
  price int NOT NULL,
  amount int NOT NULL,
  profit int
);

CREATE INDEX idx_transactions_investor_date ON transactions(investor_id, date);

-- 4. rebalance_history 테이블
CREATE TABLE rebalance_history (
  id serial PRIMARY KEY,
  investor_id text NOT NULL REFERENCES profiles(id),
  date date NOT NULL,
  trades jsonb DEFAULT '[]'::jsonb,
  total_asset_after int NOT NULL
);

CREATE INDEX idx_rebalance_history_investor ON rebalance_history(investor_id, date);

-- 5. allocations 테이블
CREATE TABLE allocations (
  investor_id text NOT NULL REFERENCES profiles(id),
  date date NOT NULL,
  investor text NOT NULL,
  strategy text NOT NULL,
  rationale text,
  allocation jsonb NOT NULL,
  allocation_sum float NOT NULL DEFAULT 1.0,
  num_stocks int NOT NULL,
  generated_at timestamptz DEFAULT now(),
  PRIMARY KEY (investor_id, date)
);

-- 6. news 테이블
CREATE TABLE news (
  date date PRIMARY KEY,
  collected_at timestamptz DEFAULT now(),
  count int NOT NULL DEFAULT 0,
  articles jsonb DEFAULT '[]'::jsonb
);

-- 7. daily_reports 테이블
CREATE TABLE daily_reports (
  date date PRIMARY KEY,
  generated_at timestamptz DEFAULT now(),
  market_prices jsonb DEFAULT '{}'::jsonb,
  rankings jsonb DEFAULT '[]'::jsonb,
  investor_details jsonb DEFAULT '{}'::jsonb
);

-- 8. config 테이블 (싱글턴)
CREATE TABLE config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  simulation jsonb DEFAULT '{}'::jsonb,
  investors jsonb DEFAULT '[]'::jsonb,
  stock_universe jsonb DEFAULT '[]'::jsonb,
  news_categories jsonb DEFAULT '[]'::jsonb
);
