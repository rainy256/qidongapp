// WxPusher sends HTTPS URLs. Keep only an explicit bridge to the installed APK.
import {nativeLinkForPath} from '../native-link.mjs';
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
export function nativeLanding(path){
 const native=nativeLinkForPath(path);
 if(!native)return null;
 return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>启动！</title><style>body{background:#fffbf4;color:#2f2622;font:17px system-ui;max-width:440px;margin:0 auto;padding:32px}a{display:block;margin:16px 0;padding:16px;border-radius:14px;background:#4e5cd6;color:white;text-align:center;text-decoration:none}</style><h1>启动！</h1><p>请在已安装的 App 中查看通知。</p><a href="'+native+'">打开 App</a><p>如果无法打开，请先安装正式签名 APK，再从应用内查看消息。</p></html>',{headers});
}
