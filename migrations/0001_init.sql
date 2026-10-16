-- OKM Football Académie : schéma initial (Cloudflare D1 / SQLite)
-- Appliquer : npx wrangler d1 migrations apply okm-db --remote   (ou --local pour tester)

CREATE TABLE roles (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
INSERT INTO roles (id, label) VALUES
  ('admin', 'Administrateur général'),
  ('communication', 'Responsable de communication'),
  ('sport', 'Responsable sportif');

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL REFERENCES roles(id),
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,           -- empreinte SHA-256 du jeton (le jeton n'est jamais stocké)
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key      TEXT PRIMARY KEY,             -- email|empreinte IP
  count    INTEGER NOT NULL,
  first_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,         -- action|empreinte IP
  count        INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  user_id    TEXT,
  user_email TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  summary    TEXT
);

CREATE TABLE media (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  uploaded_by TEXT,
  created_at  TEXT NOT NULL
);

-- Tables de contenu : un document JSON par ligne, validé côté serveur.
-- Les champs privés (coordonnées, notes internes) restent dans ces tables et ne sont jamais renvoyés par l'API publique.
CREATE TABLE news                  (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE categories            (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE teams                 (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE players               (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE competitions          (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE matches               (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE trophies              (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE albums                (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE partners              (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE registration_requests (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE contact_messages      (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE consent_records       (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
CREATE TABLE site_settings         (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);

CREATE INDEX idx_reg_created ON registration_requests(created_at);
CREATE INDEX idx_msg_created ON contact_messages(created_at);
