const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const TTL = 60 * 60 * 1000;
const MAX_BYTES = 32 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');

function createSharingStore({ now = Date.now, maxBytes = 128 * 1024 * 1024, maxDocuments = 32 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '5e-sharing-'));
  fs.chmodSync(root, 0o700);
  const entries = new Map();
  let used = 0;
  function remove(id) {
    const entry = entries.get(id);
    if (!entry) return;
    fs.rmSync(path.join(root, id), { force: true });
    clearTimeout(entry.timer);
    entries.delete(id); used -= entry.size;
  }
  function sweep() { for (const [id, entry] of entries) if (now() >= entry.expiresAt) remove(id); }
  return {
    root, sweep,
    async create(document) {
      const { parseSharingDocument } = await import('../../js/ai-sharing-document.mjs');
      const parsed = await parseSharingDocument(document);
      const bytes = Buffer.from(JSON.stringify(parsed));
      sweep();
      if (bytes.length > MAX_BYTES || used + bytes.length > maxBytes || entries.size >= maxDocuments) throw Object.assign(new Error('공유 저장 공간이 부족합니다. 문서 크기를 줄이거나 잠시 후 다시 시도해 주세요.'), { status: 413 });
      const id = randomBytes(24).toString('hex');
      const revokeKey = randomBytes(32).toString('hex');
      const expiresAt = now() + TTL;
      fs.writeFileSync(path.join(root, id), bytes, { mode: 0o600, flag: 'wx' });
      const timer = setTimeout(() => remove(id), TTL); timer.unref();
      entries.set(id, { size: bytes.length, expiresAt, revokeHash: digest(revokeKey), timer }); used += bytes.length;
      return { id, revokeKey, expiresAt, storage: 'temporary', availabilityGuaranteed: false };
    },
    get(id) {
      sweep();
      if (!entries.has(id)) throw Object.assign(new Error('공유 링크가 만료·해제되었거나 임시 저장소에서 삭제되었습니다.'), { status: 410 });
      return JSON.parse(fs.readFileSync(path.join(root, id), 'utf8'));
    },
    revoke(id, key) {
      sweep();
      const entry = entries.get(id);
      if (!entry) return;
      if (typeof key !== 'string' || digest(key) !== entry.revokeHash) throw Object.assign(new Error('공유 해제 권한이 없습니다.'), { status: 403 });
      remove(id);
    },
    close() { for (const id of entries.keys()) remove(id); fs.rmSync(root, { recursive: true, force: true }); },
  };
}
module.exports = { createSharingStore, TTL, MAX_BYTES };
