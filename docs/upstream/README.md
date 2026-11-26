# 启动 / 约局车票 (qidong)

面向微信 / QQ 熟人群与游戏开黑车队的免登录约玩时间同步网站。全程连续可玩人数交集推荐。

**主方案：Cloudflare Workers + Static Assets + D1，前台每 6 秒同步。** 无需自购服务器。Fastify + SQLite WAL + SSE 保留作为独立备用方案，不与 D1 共享数据。

当前：Cloudflare 适配及修复代码已提交；自动化测试、真实 Cloudflare 部署和微信双机验收须实际运行确认。

## 首次上线

完整步骤见 [Cloudflare 部署指南](docs/CLOUDFLARE.md)。创建 D1 数据库 qidong-db，将 database_id 填入 wrangler.jsonc。连接 GitHub main 分支到 Workers，项目名 qidong，构建命令 npm run build:cloudflare，部署命令 npm run deploy:cloudflare，配置运行时 TOKEN_PEPPER Secret。

## 快速开始

```bash
npm ci
npm test
npm run typecheck
npm run build
# 本地 Cloudflare 模式：先创建 .dev.vars（参考 .dev.vars.example）
npm run d1:local
npm run dev:cloudflare

# 备用 Fastify：两个终端分别运行
npm run dev:server
npm run dev
# Fastify 生产前端
npm run build:server
# Mock 演示
npm run dev:mock
```

### 本地预览入口（Mock 演示模式 `npm run dev:mock` 可直接访问）

- **建房页：** `http://127.0.0.1:5173/`（狂奔小黄豆横幅 + `Apex` / `GTA` / `塔科夫` / `自定义` 贴纸墙 + 撕页日历）
- **主推演示车票（差 1 人凑齐）：** `http://127.0.0.1:5173/r/demo-almost`
- **算法防误报反例（甲乙丙丁戊中途换人）：** `http://127.0.0.1:5173/r/demo-counterexample`
- **其他内置场景：** `/r/demo-ready`、`/r/demo-midnight`、`/r/demo-closed`、`/r/demo-empty`（也可点击右下角 / 页面底部的「演示切换」自由切换身份、断网、剪贴板受限与 409 冲突）

---

## 目录结构

```text
.
├── deploy/
│   ├── nginx.conf               # 生产 Nginx 同域反代与 SSE 防缓冲配置
│   └── yueju.service            # systemd 单进程托管配置
├── docs/
│   ├── PROJECT_PLAN.md          # 完整产品设计、视觉定稿、推荐算法与产品与架构规划
│   ├── API_CONTRACT.md          # SQLite DDL、5 个同源 API + SSE 契约与 Nginx 配置
│   └── HANDOFF.md               # 给新对话 / 接力开发的上下文与 接力与验收清单
├── server/
│   ├── index.ts                 # 后端服务启动入口与过期房间定期清理
│   ├── app.ts                   # Fastify 路由、Origin 校验、HttpOnly Cookie 与 SSE 接入
│   ├── db.ts                    # SQLite (WAL) 事务持久化与双版本并发控制
│   ├── sseHub.ts                # 房间级 SSE 订阅广播与 25s 心跳
│   ├── security.ts              # 高熵 ID/Token 生成、SHA-256 + Pepper 哈希与同源校验
│   ├── validation.ts            # 请求体合法性校验
│   ├── config.ts                # 环境变量配置解析
│   └── server.test.ts           # Vitest 后端并发、409/410、SSE、CSRF 与反例集成测试
├── public/art/                  # 确认保留的 5 张小黄豆系列美术资源（严禁绿色）
│   ├── hero-runner.png          # 顶部狂奔小黄豆（240×352）
│   ├── game-apex.png            # Apex 变幻小黄豆（850×850）
│   ├── game-gta.png             # GTA 金条粉钻小黄豆（1254×1254）
│   ├── game-tarkov.png          # 塔科夫 Killa 显卡金币小黄豆（1254×1254）
│   └── game-custom.png          # 自定义卫衣耳机手柄小黄豆（1254×1254）
└── src/
    ├── api/
    │   ├── repository.ts        # 唯一仓库抽象 RoomRepository 与错误类型
    │   ├── mockClient.ts        # Phase 1 本地内存 Mock 实现（带幂等、SSE 推送模拟）
    │   └── httpSseClient.ts     # 同源 HTTP + SSE / 轮询客户端
    ├── domain/
    │   ├── types.ts             # Slot / Span / Night / Pick / RoomSnapshot 等共享类型
    │   ├── time.ts              # Asia/Shanghai 半小时格点转换与「次日」跨午夜格式化
    │   ├── recommend.ts         # 纯函数交集推荐引擎、分布条统计、草稿反馈、群通知文案
    │   └── recommend.test.ts    # Vitest 核心用例与反例测试
    ├── mocks/scenarios.ts       # 6 个隔离的开黑演示房间种子数据
    ├── components/              # Boarding Pass 车票、波浪分布条、原生 <select> 时段选择器、弹窗等
    ├── pages/                   # CreateRoomPage (/) & RoomPage (/r/:id)
    └── styles/                  # 无绿色奶油手账配色 tokens.css & global.css
```

---

## 云端新增文件

- worker/index.ts：Worker HTTP API、会话和幂等
- worker/migrations/0001_initial.sql：D1 原子写入触发器
- worker/worker.test.ts：Worker API/SQLite 适配测试
- wrangler.jsonc：静态资源、D1 绑定与定时清理
- docs/CLOUDFLARE.md：首次部署和验收

继续开发请阅读 [HANDOFF](docs/HANDOFF.md)、[PROJECT_PLAN](docs/PROJECT_PLAN.md) 和 [API_CONTRACT](docs/API_CONTRACT.md)。
