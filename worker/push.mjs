export class WxPusherProvider {
 constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;}
 async send(input){return (await this.sendDetailed(input)).status;}
 async sendDetailed({spt,url,delayed=false}){
  try {
   const payload={spt,contentType:1,summary:delayed?'启动！延时测试':'启动！设备测试',content:delayed?'启动！云端延时通知：请确认锁屏及关闭启动 App 后仍能接收。':'启动！设备测试：请检查锁屏通知。'};
   if(url)payload.url=url;
   const res=await this.fetcher('https://wxpusher.zjiecode.com/api/send/message/simple-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
   const http=res.status;
   if(!res.ok)return {status:'unknown',http,code:null,reason:'http'};
   let data;try{data=await res.json();}catch{return {status:'unknown',http,code:null,reason:'invalid_json'};}
   const code=Number.isInteger(data?.code)?data.code:null;
   if(code===null)return {status:'unknown',http,code,reason:'missing_code'};
   if(code!==1000||data?.success===false)return {status:'rejected',http,code,reason:'provider_rejected'};
   if(Array.isArray(data.data)&&data.data.some(x=>x?.code!==1000))return {status:'rejected',http,code,reason:'recipient_rejected',recipientCode:Number.isInteger(data.data.find(x=>x?.code!==1000)?.code)?data.data.find(x=>x?.code!==1000).code:null};
   return {status:'accepted',http,code,reason:'accepted'};
  }catch(e){return {status:'unknown',http:null,code:null,reason:e?.name==='TimeoutError'||e?.name==='AbortError'?'timeout':/illegal invocation|incorrect this|incompatible receiver/i.test(String(e?.message||''))?'illegal_invocation':/ssl|tls|certificate/i.test(String(e?.message||''))?'tls':/dns|resolve/i.test(String(e?.message||''))?'dns':'network'};}
 }
}
