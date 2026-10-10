ALTER TABLE memo_entries ADD COLUMN image_ids TEXT NOT NULL DEFAULT '[]';
CREATE TABLE memo_images (
  id TEXT PRIMARY KEY CHECK(length(id)=36),
  entry_id TEXT REFERENCES memo_entries(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('image/png','image/jpeg','image/webp','image/gif')),
  size INTEGER NOT NULL CHECK(size>0 AND size<=5000000),
  upload_key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER))
);
CREATE INDEX memo_images_entry ON memo_images(entry_id);
CREATE INDEX memo_images_orphans ON memo_images(created_at) WHERE entry_id IS NULL;
CREATE TABLE memo_image_chunks (
  image_id TEXT NOT NULL REFERENCES memo_images(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  data BLOB NOT NULL CHECK(length(data)<=262144),
  PRIMARY KEY(image_id,part)
);
CREATE TABLE memo_link_previews (
  entry_id TEXT PRIMARY KEY REFERENCES memo_entries(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  checked_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec')*1000 AS INTEGER))
);
