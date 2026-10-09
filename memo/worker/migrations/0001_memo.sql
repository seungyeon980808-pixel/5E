CREATE TABLE memo_entries (
  id TEXT PRIMARY KEY CHECK(length(id)=36),
  kind TEXT NOT NULL CHECK(kind IN ('memo','sticky')),
  title TEXT NOT NULL DEFAULT '' CHECK(length(title)<=160),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=100000),
  color TEXT NOT NULL DEFAULT 'lilac' CHECK(color IN ('lilac','amber','slate','rose')),
  x REAL NOT NULL DEFAULT 0.1 CHECK(x>=0 AND x<=1),
  y REAL NOT NULL DEFAULT 0.1 CHECK(y>=0 AND y<=1),
  tilt REAL NOT NULL DEFAULT 0 CHECK(tilt>=-4 AND tilt<=4),
  z INTEGER NOT NULL DEFAULT 0 CHECK(z>=0 AND z<=2147483647),
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1)
);
CREATE INDEX memo_entries_age ON memo_entries(created_at DESC,id DESC);
CREATE TRIGGER memo_immutable_age BEFORE UPDATE OF id,created_at ON memo_entries
WHEN NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT,'Memo identity and creation time are immutable'); END;
