const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { startLocalExam } = require('../scripts/start-rhwp-exam.cjs');

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function close(server) { await new Promise(resolve => server.close(resolve)); }

test('local exam launches independently, serves RHWP and reuses the same workspace', async () => {
  const reservation = http.createServer();
  const port = await listen(reservation); await close(reservation);
  let launched;
  try {
    launched = await startLocalExam({ port, openBrowser:false });
    assert.ok(launched.pid);
    assert.equal(launched.reused, false);
    assert.equal(new URL(launched.url).searchParams.get('exam'), '1');
    const page = await fetch(launched.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /rhwp-exam-workspace/);
    const asset = await fetch(`${launched.origin}/js/rhwp-exam-workspace.js`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /한글 파일 열기/);
    const again = await startLocalExam({ port, openBrowser:false });
    assert.equal(again.reused, true);
    assert.equal(again.pid, undefined);
    assert.equal(again.url, launched.url);
    const foreign = await fetch(`${launched.origin}/api/local-preview`, { headers:{ Origin:'https://example.org' } });
    assert.equal(foreign.status, 403);
  } finally {
    if (launched?.pid) {
      process.kill(launched.pid, 'SIGTERM');
      for (let i = 0; i < 20; i++) {
        try { process.kill(launched.pid, 0); } catch { break; }
        await delay(50);
      }
    }
  }
});

test('local exam refuses to reuse a different worktree on the same port', async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ app:'5e-local-preview', workspace:'different-worktree' }));
  });
  const port = await listen(server);
  try {
    await assert.rejects(startLocalExam({ port, openBrowser:false }), /다른 작업/);
    assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200, 'the other app is left running');
  } finally { await close(server); }
});

test('local exam rejects invalid ports before starting a process', async () => {
  for (const port of [0, -1, 65536, NaN, 4188.5]) {
    await assert.rejects(startLocalExam({ port, openBrowser:false }), /PORT/);
  }
});
