export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  customer TEXT,
  modality TEXT,
  manufacturer TEXT,
  model TEXT,
  serial TEXT,
  quantity INTEGER DEFAULT 1,
  installed_year INTEGER,
  confidence INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_quality REAL NOT NULL DEFAULT 0.6,
  uri TEXT,
  raw_text TEXT,
  engine TEXT,
  facts_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fact_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  confidence INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_asset ON evidence(asset_id);
CREATE INDEX IF NOT EXISTS idx_fact_asset_field ON fact_evidence(asset_id, field_name);
CREATE INDEX IF NOT EXISTS idx_history_asset ON history(asset_id);
`;
