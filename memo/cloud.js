export const DAY = 86400000;
export function normalize(row) {
  if (!row || typeof row.id !== 'string' || !Number.isInteger(row.version) || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Invalid memo response');
  return { ...row, created: Date.parse(row.created_at) };
}
export class MemoCloud {
  constructor(client) { this.client = client; this.serverTime = 0; this.syncedAt = 0; }
  now() { return this.serverTime ? this.serverTime + performance.now() - this.syncedAt : Date.now(); }
  async rpc(name, args) {
    const { data, error } = await this.client.rpc(name, args).abortSignal(AbortSignal.timeout(15000));
    if (error) throw error;
    return data;
  }
  async snapshot(archive = false, cursor = null) {
    const data = await this.rpc('memo_snapshot', { p_archive: archive, p_cursor: cursor });
    this.serverTime = Date.parse(data.server_time); this.syncedAt = performance.now();
    return { owner: data.owner, entries: data.entries.slice(0,100).map(normalize), more: data.entries.length > 100 };
  }
  async create(id, entry) { return normalize(await this.rpc('memo_create', { p_id: id, p_entry: entry })); }
  async update(id, version, patch) { return normalize(await this.rpc('memo_update', { p_id: id, p_version: version, p_patch: patch })); }
  async delete(id, version) { return this.rpc('memo_delete', { p_id: id, p_version: version }); }
}
