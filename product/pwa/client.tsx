import {useEffect,useState} from 'react';
import {Capacitor} from '@capacitor/core';
export const isPwa=import.meta.env.VITE_PWA==='1'&&!Capacitor.isNativePlatform();
export function webAuth(token:string|null):Record<string,string>{return !isPwa&&token?{Authorization:'Bearer '+token}:{};}
export async function fetchWithTimeout(url:string,init:RequestInit={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{return await fetch(url,{...init,credentials:isPwa?'same-origin':'omit',cache:'no-store',signal:ctl.signal});}finally{clearTimeout(timer);}
}
export function readLaunch(raw:string):{invite?:string,page?:'schedule'|'messages'|'me'}{
 try{const u=new URL(raw);const invite=u.searchParams.get('invite');if(invite&&/^[0-9a-f-]{36}$/.test(invite))return {invite};const page=u.searchParams.get('page');if(page==='schedule'||page==='messages'||page==='me')return {page};}catch{}
 return {};
}
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let installEvent:InstallEvent|null=null;
if(isPwa){window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e as InstallEvent;window.dispatchEvent(new Event('qidong-install'));});window.addEventListener('appinstalled',()=>{installEvent=null;window.dispatchEvent(new Event('qidong-install'));});}
export function InstallPanel(){
 const [available,setAvailable]=useState(!!installEvent),[notice,setNotice]=useState('');
 const installed=window.matchMedia('(display-mode: standalone)').matches;
 useEffect(()=>{const update=()=>setAvailable(!!installEvent);window.addEventListener('qidong-install',update);return()=>window.removeEventListener('qidong-install',update);},[]);
 async function install(){if(!installEvent)return;const event=installEvent;installEvent=null;setAvailable(false);try{await event.prompt();const choice=await event.userChoice;setNotice(choice.outcome==='accepted'?'已接受安装，请检查桌面。':'也可以继续使用网页。');}catch{setNotice('请使用浏览器菜单添加桌面入口。');}}
 return <section className="pwaInstall"><h3>鸿蒙 / 网页使用</h3>{installed?<p>已通过独立窗口打开。</p>:<><p>可直接在浏览器使用；若浏览器支持，打开菜单选择「添加到桌面」或「安装应用」。</p>{available&&<button className="primary" onClick={()=>void install()}>安装到桌面</button>}</>}<small>通知仍由 WxPusher 接收；关闭网页不影响服务器发送提醒。清除网站数据后，使用个人口令重新登录。</small><button onClick={()=>window.location.reload()}>刷新网页版本</button>{notice&&<p role="status">{notice}</p>}</section>;
}
export function registerPwa(){if('serviceWorker' in navigator)navigator.serviceWorker.register('/app/sw.js',{scope:'/app/',updateViaCache:'none'}).catch(()=>{});}
