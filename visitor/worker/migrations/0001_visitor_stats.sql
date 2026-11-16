-- 방문자 집계(scripts/visitor-stats-server.cjs와 같은 표). 원본 UUID·IP는 저장하지 않고 HMAC 값만 저장한다.
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visitors (visitor_hash TEXT PRIMARY KEY) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS daily_visitors (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
) WITHOUT ROWID;
