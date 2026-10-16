const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

async function createBugBoardServer({ directory, adminToken, allowedOrigins = [] } = {}) {
  if (!directory || !adminToken || adminToken.length < 24) throw new Error('A private report directory and admin key (24+ characters) are required');
  fs.mkdirSync(directory, { recursive:true, mode:0o700 });
  const filename = path.join(directory,'board.sqlite');
  const database = new DatabaseSync(filename);
  fs.chmodSync(filename,0o600);
  database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  database.exec(fs.readFileSync(path.join(__dirname,'../bug/schema.sql'),'utf8'));
  const db = { prepare(sql) { return { bind(...values) {
    const query = database.prepare(sql);
    return { first:async () => query.get(...values) || null,
      all:async () => ({ results:query.all(...values) }),
      run:async () => ({ meta:{ changes:Number(query.run(...values).changes) } }) };
  } }; } };
  const imageRoot = path.join(directory,'images'); fs.mkdirSync(imageRoot,{ recursive:true,mode:0o700 });
  const imagePath = key => {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid attachment key');
    return path.join(imageRoot,...key.split('/'));
  };
  const images = {
    async put(key,bytes) { const file = imagePath(key); await fs.promises.mkdir(path.dirname(file),{ recursive:true,mode:0o700 }); await fs.promises.writeFile(file,bytes,{ flag:'wx',mode:0o600 }); },
    async get(key) { try { return await fs.promises.readFile(imagePath(key)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    async remove(key) { await fs.promises.rm(imagePath(key),{ force:true }); },
  };
  const [{ createBoardStore }, { createBoardApi }] = await Promise.all([
    import(pathToFileURL(path.join(__dirname,'../bug/store.mjs'))), import(pathToFileURL(path.join(__dirname,'../bug/api.mjs'))),
  ]);
  const store = createBoardStore(db,images);
  let handler;
  const server = http.createServer(async (incoming,outgoing) => {
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (incoming.headers.host !== new URL(origin).host || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        outgoing.writeHead(403,{'Content-Type':'application/json'}); return outgoing.end(JSON.stringify({error:'Host rejected'}));
      }
      handler ||= createBoardApi({store,adminToken,allowedOrigins:[origin,...allowedOrigins]});
      const request = new Request(origin+incoming.url,{method:incoming.method,headers:incoming.headers,
        ...(!['GET','HEAD'].includes(incoming.method) ? { body:Readable.toWeb(incoming),duplex:'half' } : {})});
      const result = await handler(request,{clientIp:incoming.socket.remoteAddress});
      outgoing.writeHead(result.status,Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(503,{'Content-Type':'application/json'});
      outgoing.end(JSON.stringify({error:'신고 서버에 연결하지 못했습니다. 작성 내용은 유지됩니다.'}));
    }
  });
  server.on('close',() => database.close());
  return server;
}
module.exports = { createBugBoardServer };
if (require.main === module) {
  const directory = process.env.FIVE_E_BUG_BOARD_DIR || path.join(os.homedir(),'Library/Application Support/5E/bug-board');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const keyFile = path.join(directory,'admin-key');
  let adminToken = process.env.FIVE_E_BUG_ADMIN_TOKEN;
  if (!adminToken) {
    try { adminToken = fs.readFileSync(keyFile,'utf8').trim(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; adminToken = randomBytes(32).toString('hex'); fs.writeFileSync(keyFile,adminToken+'\n',{flag:'wx',mode:0o600}); }
  }
  createBugBoardServer({directory,adminToken,allowedOrigins:(process.env.FIVE_E_BUG_ORIGINS || 'http://127.0.0.1:51819').split(',')})
    .then(server => {
      server.listen(Number(process.env.FIVE_E_BUG_BOARD_PORT || 61910),'127.0.0.1',() => console.log(`5E bug board API: http://127.0.0.1:${server.address().port}/api/bug-board (private data: ${directory})`));
      for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => process.exit(0)));
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
