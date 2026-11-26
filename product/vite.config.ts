import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({root:resolve(process.cwd(),'product'),base:'/',publicDir:resolve(process.cwd(),'public'),build:{outDir:resolve(process.cwd(),'dist-product'),emptyOutDir:true}});
