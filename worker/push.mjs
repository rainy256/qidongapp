export class WxPusherProvider {
 constructor(fetcher=fetch){this.fetcher=fetcher;}
 async send({spt,url}){
  const res=await this.fetcher('https://wxpusher.zjiecode.com/api/send/message/simple-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spt,url,contentType:1,summary:'启动！设备测试',content:'启动！设备测试：请检查锁屏通知和点击跳转。'}),signal:AbortSignal.timeout(10000)});
  if(!res.ok)return 'unknown';
  const data=await res.json();
  if(data?.code!==1000||data?.success===false)return 'rejected';
  if(Array.isArray(data.data)&&data.data.some(x=>x?.code!==1000))return 'rejected';
  return 'accepted';
 }
}
