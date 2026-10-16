// The same SQL and report contract run in local SQLite and Cloudflare D1.
export function createBoardStore(db, images) {
  const statement = (sql, ...values) => db.prepare(sql).bind(...values);
  const first = (sql, ...values) => statement(sql, ...values).first();
  const all = async (sql, ...values) => (await statement(sql, ...values).all()).results;
  const changes = async (sql, ...values) => (await statement(sql, ...values).run()).meta.changes;
  const decode = row => row && ({ ...row, context: JSON.parse(row.context_json), images: JSON.parse(row.images_json) });
  return {
    images,
    async get(id) { return decode(await first('SELECT * FROM reports WHERE id = ?', id)); },
    async list({ search = '', status = '', page = 1, limit = 20 } = {}) {
      const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
      const where = "WHERE (? = '' OR status = ?) AND (? = '' OR title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
      const args = [status, status, search, pattern, pattern];
      const rows = await all(`SELECT id,title,status,version,created_at,updated_at,fixed_version,revision,
        (SELECT COUNT(*) FROM votes WHERE report_id = reports.id) AS votes,
        (SELECT COUNT(*) FROM replies WHERE report_id = reports.id) AS replies
        FROM reports ${where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
      return { reports: rows, total: (await first(`SELECT COUNT(*) AS count FROM reports ${where}`, ...args)).count, page, limit };
    },
    async create(row) {
      return Boolean(await changes(`INSERT OR IGNORE INTO reports
        (id,title,description,status,version,author_hash,request_hash,context_json,images_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, row.id, row.title, row.description, 'new', row.version,
        row.author_hash, row.request_hash, JSON.stringify(row.context), JSON.stringify(row.images), row.created_at, row.updated_at));
    },
    async update(row, revision) {
      return Boolean(await changes(`UPDATE reports SET title=?,description=?,status=?,images_json=?,updated_at=?,
        fixed_version=?,fixed_commit=?,admin_note=?,revision=revision+1 WHERE id=? AND revision=?`,
      row.title, row.description, row.status, JSON.stringify(row.images), row.updated_at,
      row.fixed_version, row.fixed_commit, row.admin_note, row.id, revision));
    },
    async remove(id, revision) { return Boolean(await changes('DELETE FROM reports WHERE id=? AND revision=?', id, revision)); },
    replies: id => all('SELECT id,role,body,created_at FROM replies WHERE report_id=? ORDER BY created_at,id', id),
    async reply(id, role, body, now, replyId) {
      await changes('INSERT INTO replies (id,report_id,role,body,created_at) VALUES (?,?,?,?,?)', replyId, id, role, body, now);
    },
    async vote(id, hash) {
      await changes('INSERT OR IGNORE INTO votes (report_id,visitor_hash) VALUES (?,?)', id, hash);
      return (await first('SELECT COUNT(*) AS count FROM votes WHERE report_id=?', id)).count;
    },
    async voteCount(id) { return (await first('SELECT COUNT(*) AS count FROM votes WHERE report_id=?', id)).count; },
    faqs: () => all('SELECT * FROM faqs ORDER BY updated_at DESC,id'),
    async saveFaq(row) { await changes(`INSERT INTO faqs (id,question,answer,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET question=excluded.question,answer=excluded.answer,updated_at=excluded.updated_at`, row.id, row.question, row.answer, row.updated_at); },
    async removeFaq(id) { return Boolean(await changes('DELETE FROM faqs WHERE id=?', id)); },
    async rate(key, maximum, duration, now) {
      const row = await first(`INSERT INTO rate_limits (key,starts,hits) VALUES (?,?,1)
        ON CONFLICT(key) DO UPDATE SET starts=CASE WHEN starts<=? THEN excluded.starts ELSE starts END,
        hits=CASE WHEN starts<=? THEN 1 ELSE hits+1 END RETURNING hits`, key, now, now-duration, now-duration);
      return row.hits <= maximum;
    },
  };
}
