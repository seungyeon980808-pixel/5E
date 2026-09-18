const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createProjectRoutes } = require('./project-routes.cjs');
const root = path.resolve(__dirname,'../..');
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.otf':'font/otf','.wasm':'application/wasm','.bcmap':'application/octet-stream'};
function createSharingDevServer() {
  const projects=createProjectRoutes();
  const server=http.createServer(async(req,res)=>{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const reply=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(body);};
    if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site')return reply(403,'{}');
    try {
      if(await projects.handle(req,reply,origin))return;
      if(req.method!=='GET')return reply(405,'{}');
      const url=new URL(req.url,origin);
      const relative=['/','/editor/'].includes(url.pathname)?'index.html':decodeURIComponent(url.pathname).replace(/^\/editor\//,'/').slice(1);
      if(!/^(?:index\.html$|manifest\.json$|css\/|js\/|assets\/|fonts\/|vendor\/|experiments\/web-codex-auth\/editor-bridge\.js$|docs\/credits\.html$)/.test(relative))return reply(404,'{}');
      const file=fs.realpathSync(path.resolve(root,relative));
      if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile()||!types[path.extname(file)])return reply(404,'{}');
      let content=fs.readFileSync(file);
      if(relative==='index.html')content=content.toString('utf8').replace('</head>',`<script>window.FIVE_E_PROJECT_PACKAGE_API_URL="/api/project-package";window.FIVE_E_PROJECT_PACKAGE_TARGETS=${JSON.stringify(process.platform==='darwin'?['win32','darwin']:['win32'])};</script></head>`);
      return reply(200,content,types[path.extname(file)]);
    }catch{return reply(404,'{}');}
  });
  server.on('close',()=>{projects.close();});
  return server;
}
if(require.main===module){
  const server=createSharingDevServer();
  server.listen(Number(process.argv[2]||0),'127.0.0.1',()=>console.log(`5E local sharing development: http://127.0.0.1:${server.address().port} (temporary storage; no authentication data)`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
module.exports={createSharingDevServer};
