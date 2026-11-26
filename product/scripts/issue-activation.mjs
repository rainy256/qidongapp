import {randomBytes,createHash} from 'node:crypto';
const id=process.argv[2];
if(!['m1','m2','m3'].includes(id)){console.error('Usage: node product/scripts/issue-activation.mjs m1');process.exit(1);}
const code=randomBytes(16).toString('hex');
const hash=createHash('sha256').update(code).digest('hex');
console.log('一次性激活码（仅私下交给对应成员）：'+code);
console.log("仅将以下 SQL 粘贴到 qidongapp-db 的 D1 Console（不要粘贴明文激活码）：");
console.log("UPDATE app_members SET activation_hash='"+hash+"' WHERE id='"+id+"' AND activated_at IS NULL AND activation_hash IS NULL;");
console.log("确认更新了 1 行；若为 0 行，先核查成员是否已发放或已激活，不要擅自覆盖。");
