CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', version TEXT NOT NULL DEFAULT '',
  author_hash TEXT NOT NULL, request_hash TEXT NOT NULL,
  context_json TEXT NOT NULL, images_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  fixed_version TEXT NOT NULL DEFAULT '', fixed_commit TEXT NOT NULL DEFAULT '', admin_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS reports_recent ON reports(created_at DESC, id);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, created_at DESC);
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS votes (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL, PRIMARY KEY(report_id, visitor_hash)
);
CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, starts INTEGER NOT NULL, hits INTEGER NOT NULL);
