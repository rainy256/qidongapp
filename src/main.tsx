import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from '@capacitor/app';
import './upstream-tokens.css';
import './probe.css';
function Probe(){
 const [link,setLink]=useState('尚未接收跳转'),[active,setActive]=useState(true),[token,setToken]=useState(''),[mode,setMode]=useState('scheme'),[result,setResult]=useState('尚未请求'),[busy,setBusy]=useState(false);
 const base=(import.meta.env.VITE_PROBE_API||'').replace(/\/$/,'');
 useEffect(()=>{
  let closed=false;
  const receive=(raw:string)=>{try{const u=new URL(raw);if(u.protocol==='qidongapp:'&&u.hostname==='game'&&/^\/[a-zA-Z0-9_-]{1,64}$/.test(u.pathname)&&!u.search&&!u.hash){setLink('已接收约局编号：'+u.pathname.slice(1));}else{setLink('已拒绝非预期链接');}}catch{setLink('链接格式无效');}};
  const a=App.addListener('appUrlOpen',e=>receive(e.url));
  const b=App.addListener('appStateChange',e=>setActive(e.isActive));
  App.getLaunchUrl().then(e=>{if(!closed&&e?.url)receive(e.url);}).catch(()=>{});
  return()=>{closed=true;void a.then(h=>h.remove());void b.then(h=>h.remove());};
 },[]);
 async function send(){
  if(!/^https:\/\/[a-zA-Z0-9.-]+$/.test(base)){setResult('未配置 HTTPS 测试 Worker，未发送');return;}
  if(!token.trim()){setResult('请输入专属测试凭证');return;}
  setBusy(true);setResult('正在请求 Worker');
  try{const response=await fetch(base+'/api/probe',{method:'POST',headers:{Authorization:'Bearer '+token.trim(),'Content-Type':'application/json'},body:JSON.stringify({mode}),signal:AbortSignal.timeout(15000)});const data=await response.json();setResult(response.ok&&data.status==='accepted'?'推送接口已受理；手机是否收到仍需人工确认':'未确认受理（HTTP '+response.status+'）');}
  catch{setResult('网络异常或结果未知；请先检查 WxPusher，再尝试');}finally{setBusy(false);setToken('');}
 }
 return <main><header><img src="/art/hero-runner.png" alt="原站小黄豆"/><div><h1>启动！</h1><p>三人开黑 · 设备验证版 0.0.1</p></div></header><section><h2>安装与跳转</h2><p>当前：{active?'前台':'后台'}</p><p role="status">{link}</p><p>测试链接：qidongapp://game/probe</p></section><section><h2>WxPusher 实际通知测试</h2><p>{base?'测试服务：'+base:'此构建未设置测试服务'}</p><label>个人测试凭证<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/></label><label>链接类型<select value={mode} onChange={e=>setMode(e.target.value)}><option value="scheme">直接打开 App</option><option value="https">HTTPS 测试入口</option></select></label><button disabled={busy||!base} onClick={send}>{busy?'请求中':'发送测试通知'}</button><p role="status">{result}</p><p>请在 WxPusher 中检查通知，锁屏及关闭本 App 后也需验证。</p></section></main>;
}
createRoot(document.getElementById('root')!).render(<Probe/>);
