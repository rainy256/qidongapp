# Cloudflare Workers + D1 部署（主方案）

当前主方案不需要自购服务器：Workers Static Assets 托管 React/Vite SPA，Worker 处理 /api/*，D1 保存真实房间和参与者，6 秒可见态轮询同步。Fastify + SQLite WAL + SSE 保留为备用部署，互不共享数据库。没有登录流程。

## 首次部署（推荐 Cloudflare Dashboard + GitHub）
1. 登录 https://dash.cloudflare.com/，在 Workers & Pages 的 D1 SQL Database 创建数据库，名称 qidong-db。复制该数据库的 UUID。
2. 在 GitHub 的 main 分支编辑根目录 wrangler.jsonc，为 DB 绑定填入真实的 database_id（保留 database_name 和 migrations_dir）。不要把 API token 或 TOKEN_PEPPER 写入 Git。
3. 在 Workers & Pages 中创建 Worker，通过 GitHub 导入 rainy256/qidong，项目名 qidong，生产分支 main，根目录 /。使用 Workers，不是 Pages。
4. Build command: npm run build:cloudflare
   Deploy command: npm run deploy:cloudflare
   Node version: 22（仓库已提供 .node-version，可在 Build variables 中设置 NODE_VERSION=22）。
   关闭非生产分支的自动预览部署，避免测试环境使用真实 D1。
   构建所用的 Cloudflare API token 需要 Workers 部署和目标账户 D1 编辑权限。若迁移命令没有权限，请先在 D1 控制台执行 worker/migrations/0001_initial.sql 或用授权的 Wrangler CLI 执行 npm run d1:remote；若手动执行 SQL，避免之后重复执行同一迁移，推荐始终用 Wrangler migrations apply。
5. 在 Worker 的 Settings > Variables and Secrets 中添加运行时 Secret TOKEN_PEPPER（不是仅在 Build variables 中添加）。用密码管理器生成至少 32 个字符的随机密钥。不得使用示例值；上线后不要随意变更，否则旧匿名身份失效。可选 ROOM_TTL_DAYS 默认 30。
6. 检查生产绑定 DB 指向 qidong-db，首次部署完成后打开 Worker 默认 HTTPS 域名。GET /api/health 应返回 {"ok":true,"syncMode":"poll"}；如果返回 503 请检查 Secret，500 请检查 D1 绑定及迁移。
7. 用两个不同浏览器（或两台手机）从首页建房、复制邀请、提交、等待同步、修改本人时间、结束收集。验证刷新后记录还在。自定义域名可在 Domains & Routes 中配置；暂不预设你的域名。

## CLI 备选（本地电脑）
Node.js 22 或兼容的新 LTS，npm ci。运行 npx --yes wrangler@4 login，创建数据库 npx --yes wrangler@4 d1 create qidong-db，确认 wrangler.jsonc 的 database_id。先 npm run build:cloudflare，然后 npm run deploy:cloudflare（先应用数据库迁移，再部署代码）。部署后 npx --yes wrangler@4 secret put TOKEN_PEPPER。不要在聊天、日志或仓库中公开密钥。

## 本地开发与检查
- 复制 .dev.vars.example 到 .dev.vars，替换随机密钥（该文件已被 gitignore）。
- npm run d1:local，再 npm run dev:cloudflare；浏览器打开 Wrangler 输出的 localhost 地址。
- npm test：推荐算法、Fastify、HTTP/SSE 客户端以及 Worker API 的 SQLite 适配测试。Worker 测试执行实际 SQL 和触发器，但不等于已验证真实远程 D1。
- npm run typecheck：分别检查各 TypeScript 项目。
- npm run build（等价于 npm run build:cloudflare）。
- Fastify 备用模式：npm run dev:server 和 npm run dev，或者 npm run build:server 生成 SSE 前端。生产需要真实 TLS 配置和固定随机 TOKEN_PEPPER，不可直接启用示例 HTTP 配置。
- 纯前端演示：npm run dev:mock。

## 数据一致性、安全和费用
- GET /api/session 先建立 HttpOnly、SameSite=Lax、HTTPS Secure 的匿名会话，房主与成员身份按会话和房间进行 HMAC 派生。建房 ID 绑定会话和 128 bit 随机 mutationId，同一会话重试恢复房主权限，其他会话不继承房主。清除 Cookie、跨浏览器或换域名不会自动恢复身份。
- 保存与关房通过同一 D1 SQL INSERT 和触发器原子完成。已成功操作重放不重复写入，关房后新保存为 410；版本冲突为 409。单纯浏览不创建成员。
- 30 天后房间失效，Cron 每 6 小时分批清理，外键级联清理成员和操作记录。
- Cloudflare 免费套餐有请求、读取行、写入行等额度；每个前台房间每小时约 600 次轮询，后台暂停。对熟人小群适用，不承诺永久免费或中国大陆所有网络稳定访问。公开推广前应补充防滥用限制、实际负载测试与数据备份。
- 目前代码已提交，未在真实 Cloudflare 账户执行部署，未完成微信双机验收。D1 UUID、密钥和账户授权必须在部署时提供。

官方文档：
https://developers.cloudflare.com/workers/ci-cd/builds/
https://developers.cloudflare.com/d1/get-started/
https://developers.cloudflare.com/workers/static-assets/binding/
