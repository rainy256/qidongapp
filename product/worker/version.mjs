export function versionCode(tag){const m=String(tag).match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);if(!m)return null;const [a,b,c]=m.slice(1).map(Number);if(a>2000||b>999||c>999)return null;return a*1000000+b*1000+c;}
export async function latestVersion(fetcher=(...args)=>globalThis.fetch(...args)){
 const r=await fetcher('https://api.github.com/repos/rainy256/qidongapp/releases/latest',{headers:{'User-Agent':'qidongapp-version','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
 if(r.status===404)return {available:false};if(!r.ok)throw Error('version_unavailable');
 const data=await r.json(),code=versionCode(data.tag_name);
 if(data.draft||data.prerelease||code===null)return {available:false};
 const expected='https://github.com/rainy256/qidongapp/releases/download/'+data.tag_name+'/qidongapp.apk';
 if(!Array.isArray(data.assets)||!data.assets.some(x=>x.name==='qidongapp.apk'&&x.browser_download_url===expected))return {available:false};
 return {available:true,version:data.tag_name.replace(/^v/,''),versionCode:code,url:expected};
}
