import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
let db;
const owner='11111111-1111-4111-8111-111111111111', stranger='22222222-2222-4222-8222-222222222222';
const fresh='33333333-3333-4333-8333-333333333333', old='44444444-4444-4444-8444-444444444444';
async function asRole(role,uid,sql,params=[]) {
  return db.transaction(async tx=>{
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid||'']);
    return tx.query(sql,params);
  });
}
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261009010000_memo.sql',import.meta.url),'utf8'));
  await db.query("insert into private.memo_owners values ('owner@example.com')");
  await db.query(`insert into auth.identities values ($1,'google','{"email":"owner@example.com","email_verified":true}'),($2,'google','{"email":"other@example.com","email_verified":true}')`,[owner,stranger]);
});
after(()=>db.close());
test('anonymous create is idempotent and clock and fields are server controlled',async()=>{
  const sql='select public.memo_create($1,$2) as entry';
  const a=await asRole('anon',null,sql,[fresh,{kind:'memo',title:'전송 링크',body:'https://example.com'}]);
  const b=await asRole('anon',null,sql,[fresh,{kind:'memo',body:'must not duplicate or overwrite'}]);
  assert.equal(a.rows[0].entry.body,b.rows[0].entry.body);assert.equal(a.rows[0].entry.version,1);
  await assert.rejects(asRole('anon',null,sql,['55555555-5555-4555-8555-555555555555',{kind:'memo',body:'clock',created_at:'2099-01-01'}]),/Invalid memo fields/);
  await assert.rejects(asRole('anon',null,'insert into public.memo_entries(id,kind,body) values ($1,\'memo\',\'x\')',[old]),/permission denied/);
});
test('24-hour archive is unavailable by direct select, RPC and guessed UUID to anon and other Google accounts',async()=>{
  await db.query("insert into public.memo_entries(id,kind,body,created_at) values ($1,'memo','private archive',now()-interval '24 hours')",[old]);
  for(const [role,uid] of [['anon',null],['authenticated',stranger]]){
    const direct=await asRole(role,uid,'select body from public.memo_entries where id=$1',[old]);assert.equal(direct.rows.length,0);
    await assert.rejects(asRole(role,uid,'select public.memo_snapshot(true,null)'),/Owner login required/);
    await assert.rejects(asRole(role,uid,'select public.memo_update($1,1,$2)',[old,{body:'expose'}]),/moved to archive/);
    await assert.rejects(asRole(role,uid,'select public.memo_delete($1,1)',[old]),/moved to archive/);
    await assert.rejects(asRole(role,uid,'select public.memo_create($1,$2)',[old,{kind:'memo',body:'reuse id'}]),/moved to archive/);
  }
  const archive=await asRole('authenticated',owner,'select public.memo_snapshot(true,null) as snapshot');
  assert.equal(archive.rows[0].snapshot.entries[0].body,'private archive');assert.equal(archive.rows[0].snapshot.owner,true);
});
test('only a verified Google identity belonging to the designated owner grants access',async()=>{
  await db.query("update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where user_id=$1",[owner]);
  await assert.rejects(asRole('authenticated',owner,'select public.memo_snapshot(true,null)'),/Owner login required/);
  await db.query("update auth.identities set provider='email',identity_data=jsonb_set(identity_data,'{email_verified}','true') where user_id=$1",[owner]);
  await assert.rejects(asRole('authenticated',owner,'select public.memo_snapshot(true,null)'),/Owner login required/);
  await db.query("update auth.identities set provider='google' where user_id=$1",[owner]);
});
test('pinning and editing retain original age, concurrent edits reject stale versions',async()=>{
  const original=(await db.query('select * from public.memo_entries where id=$1',[fresh])).rows[0];
  const update=await asRole('anon',null,'select public.memo_update($1,$2,$3) as entry',[fresh,1,{kind:'sticky',x:.82,title:'새 제목'}]);
  assert.equal(Date.parse(update.rows[0].entry.created_at),original.created_at.getTime());assert.equal(update.rows[0].entry.version,2);
  await assert.rejects(asRole('anon',null,'select public.memo_update($1,1,$2)',[fresh,{body:'stale'}]),/changed on another device/);
  await assert.rejects(asRole('anon',null,'select public.memo_delete($1,1)',[fresh]),/changed on another device/);
  await assert.rejects(asRole('anon',null,'select public.memo_update($1,null,$2)',[fresh,{body:'bypass version'}]),/changed on another device/);
  await assert.rejects(asRole('anon',null,'select public.memo_update($1,2,$2)',[fresh,{created_at:'2099-01-01'}]),/Invalid memo fields/);
  await asRole('anon',null,'select public.memo_delete($1,2)',[fresh]);
});
test('public snapshots paginate without repeating rows with equal creation times',async()=>{
  await db.exec("insert into public.memo_entries(id,kind,body) select gen_random_uuid(),'memo','메모 '||n from generate_series(1,103) n");
  const first=(await asRole('anon',null,'select public.memo_snapshot(false,null) as s')).rows[0].s;
  assert.equal(first.entries.length,101);assert.ok(first.server_time);
  const last=first.entries[99];
  const second=(await asRole('anon',null,'select public.memo_snapshot(false,$1) as s',[{id:last.id,created_at:last.created_at}])).rows[0].s;
  assert.equal(second.entries.length,3);assert.ok(!first.entries.slice(0,100).some(x=>second.entries.some(y=>x.id===y.id)));
});
