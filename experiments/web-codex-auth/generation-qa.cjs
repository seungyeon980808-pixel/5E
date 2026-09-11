// Synthetic UI fixture only. Never invokes Codex or an image model.
const {EventEmitter}=require('node:events');
const {createServer}=require('./server.cjs');
const {createGateway}=require('./editor-gateway.cjs');
const png=require('node:fs').readFileSync(process.env.QA_IMAGE_PATH || require('node:path').join(__dirname,'evidence/generation/actual-first.png')).toString('base64');
class Fixture extends EventEmitter {
 async init() {} close() {} async rpc(method,params) {
  if(method==='model/list')return {data:[{id:'gpt-5.6-sol',model:'gpt-5.6-sol',displayName:'Sol (synthetic QA)',supportedReasoningEfforts:[{reasoningEffort:'medium'}],serviceTiers:['priority']}]};
  if(method==='account/read')return {account:{type:'chatgpt'}};
  if(method==='thread/start')return {thread:{id:'synthetic-thread'}};
  if(method==='turn/start') {this.fail=params.input[0].text.includes('QA_FAIL');setTimeout(()=>this.emit('notification',{method:this.fail?'turn/completed':'item/completed',params:{threadId:'synthetic-thread',turnId:'synthetic-turn',item:{type:'imageGeneration',result:png}}}),5000);return {turn:{id:'synthetic-turn'}};}
  return {};
 }
}
const auth=createServer({runtimeFactory:()=>new Fixture()});
const gateway=createGateway({authPort:19384});
auth.listen(19384,'127.0.0.1');gateway.listen(19387,'127.0.0.1',()=>console.log('Synthetic generation QA on19387'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{auth.close();gateway.close();});
