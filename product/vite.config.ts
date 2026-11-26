import {defineConfig} from 'vite';
import {resolve} from 'node:path';
const pwa=process.env.VITE_PWA==='1';
export default defineConfig({root:resolve(process.cwd(),'product'),base:pwa?'/app/':'/',publicDir:resolve(process.cwd(),'public'),build:{outDir:resolve(process.cwd(),pwa?'dist-pwa':'dist-product'),emptyOutDir:true}});
