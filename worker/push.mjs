export class WxPusherProvider {
 constructor(fetcher=fetch){this.fetcher=fetcher;}
 async send(input){return (await this.sendDetailed(input)).status;}
 async sendDetailed({spt,url}){
  try {
   const payload={spt,contentType:1,summary:'启动！设备测试',content:'启动！设备测试：请检查锁屏通知。'};
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
  }catch(e){return {status:'unknown',http:null,code:null,reason:e?.name==='TimeoutError'||e?.name==='AbortError'?'timeout':'network'};}
 }
}
