const fs=require('node:fs'),path=require('node:path');
const {publicConfig}=require('./memo-config.cjs');
const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../memo/worker/wrangler.jsonc'),'utf8'));
if(config.name!=='5e-memo-api'||config.main!=='index.js')throw Error('Dedicated memo Worker required');
const db=config.d1_databases?.find(b=>b.binding==='DB');
if(!db||db.database_name!=='5e-memo'||! /^[a-f0-9-]{36}$/.test(db.database_id)||db.database_id==='00000000-0000-0000-0000-000000000000')throw Error('Configure the actual memo D1 database');
publicConfig('https://5e-memo-api.5e-desktop.workers.dev',config.vars?.GOOGLE_CLIENT_ID);
console.log('Memo Worker configuration verified');
