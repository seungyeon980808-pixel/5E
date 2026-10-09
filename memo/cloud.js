export const DAY=86400000;
export function normalize(row){
  if(!row||typeof row.id!=='string'||!Number.isInteger(row.version)||!Number.isFinite(Date.parse(row.created_at)))throw Error('Invalid memo response');
  return {...row,created:Date.parse(row.created_at)};
}
export class MemoCloud {
  constructor(config,onAuth){
    this.url=config.apiUrl;this.onAuth=onAuth;this.serverTime=0;this.syncedAt=0;
    this.key='5e-memo-google:'+this.url;
    try{this.token=sessionStorage.getItem(this.key)||'';}catch{this.token='';}
  }
  now(){return this.serverTime?this.serverTime+performance.now()-this.syncedAt:Date.now();}
  logout(){this.token='';clearTimeout(this.expiry);try{sessionStorage.removeItem(this.key);}catch{}this.onAuth(null);}
  async request(path,method='POST',data,anonymousRetry=false){
    const headers={'content-type':'application/json'};if(this.token)headers.authorization='Bearer '+this.token;
    const response=await fetch(this.url+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(response.status===401){this.logout();if(anonymousRetry)return this.request(path,method,data);}
    if(!response.ok){const error=Error(result.message||'Memo request failed');error.code=result.code;throw error;}
    return result;
  }
  async snapshot(archive=false,cursor=null){
    const startedToken=this.token;
    const data=await this.request('/snapshot','POST',{archive,cursor},!archive);
    if(startedToken!==this.token&&(data.user||this.token)){const error=Error('Google account changed');error.code='AUTH_CHANGED';throw error;}
    this.serverTime=Date.parse(data.server_time);this.syncedAt=performance.now();
    if(data.user){
      this.onAuth(data.user);clearTimeout(this.expiry);
      this.expiry=setTimeout(()=>this.logout(),Math.max(0,data.user.expires_at*1000-this.serverTime));
    }else if(this.token)this.logout();
    return {owner:data.owner,entries:data.entries.slice(0,100).map(normalize),more:data.entries.length>100};
  }
  async login(token){
    this.token=token;
    try{const snapshot=await this.snapshot();try{sessionStorage.setItem(this.key,token);}catch{}return snapshot;}
    catch(error){this.logout();throw error;}
  }
  async create(id,entry){return normalize(await this.request('/entries','POST',{id,entry}));}
  async update(id,version,patch){return normalize(await this.request('/entries/'+id,'PATCH',{version,patch}));}
  async delete(id,version){return this.request('/entries/'+id,'DELETE',{version});}
}
