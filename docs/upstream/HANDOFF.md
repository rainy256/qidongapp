# 新对话接力指南（Handoff Guide）

当前主部署方案为 Cloudflare Workers + D1。先读 [CLOUDFLARE.md](CLOUDFLARE.md)，再根据实际测试结果继续部署；不要推翻既有界面。以下 Phase 1 与 Fastify 部分为历史实现及备用部署记录。

---

## 1. 当前已完成清单（Phase 1）

- **纯领域引擎与时间库（可直接被后端 Node/TS 复用）**：
  - `src/domain/types.ts`：`Slot`、`Span`、`Night`、`Pick`、`Answer`、`Submission`、`Candidate`、`RoomSnapshot`、`CreateRoomSpec`、`SaveMineInput`、`GameTag`
  - `src/domain/time.ts`：固定 `Asia/Shanghai` (+08:00) 格点转换、`次日` 跨午夜显示格式化
  - `src/domain/recommend.ts`：`mergeSpans`、`normalizePicks`、`recommend`（全程人员交集 + 连续开局窗口合并）、`computeOthersSlotAvailability`、`computeDraftFeedback`、`formatGroupNotice`
  - `src/domain/recommend.test.ts`：5 项 Vitest 核心用例（已全部通过）
- **接口抽象层与双客户端**：
  - `src/api/repository.ts`：`RoomRepository` 与语义化异常类（`RevisionConflictError`、`RoomClosedError`、`NotFoundError`、`ForbiddenError`、`NetworkError`）
  - `src/api/mockClient.ts`：完整内存 Mock，包含 6 个隔离场景（`src/mocks/scenarios.ts`）与演示控制台状态
  - `src/api/httpSseClient.ts`：已按 [`API_CONTRACT.md`](./API_CONTRACT.md) 写好的真实 `fetch + EventSource + visibilitychange` 客户端
- **手机端优先前端界面（`390×844` 实机验收 0 报错）**：
  - 建房页 `/` (`src/pages/CreateRoomPage.tsx`)：狂奔小黄豆横幅 + `Apex` / `GTA` / `塔科夫` / `自定义` 2×2 小黄豆贴纸墙 + 撕页日历 + 吸底建房按钮
  - 房间车票页 `/r/:id` (`src/pages/RoomPage.tsx`)：开黑派对车票（`RecommendationCard`）、席位头像行（`AvatarChip`）、一键跟大家凑齐 & 原生 `<select>` 选时（`NightEditor`）、蓝莓紫波浪分布条（`DensityBar`）、吸底保存条与 `<dialog>` 底部昵称弹窗（`NicknameDialog`）、房主结束收集确认框（`CloseRoomDialog`）、成员展开列表（`RosterDisclosure`）
- **美术资源（`public/art/`）**：
  - `hero-runner.png`（用户上传的狂奔小黄豆）
  - `game-apex.png`（用户上传的 Apex 变幻小黄豆）
  - `game-gta.png`、`game-tarkov.png`、`game-custom.png`（同体型无绿色小黄豆 Cosplay）

---

## 2. 不可违背的设计约束（请勿改坏）

1. **绝不使用绿色**：用户明确不喜欢绿色。主色保持蓝莓紫（`--brand-solid: #4E5CD6`），草稿与点缀保持珊瑚粉（`--peach-solid: #FF7D6B`），差 1 人保持奶酪黄（`--amber-bg: #FFF6D4`），背景保持暖奶白点阵（`--bg-canvas: #FFFBF4`）。
2. **保留 `public/art/` 全部 5 张小黄豆图与当前手机端车票结构**：不要再退回冷冰冰的桌面双栏表格或替换用户上传的 `hero-runner.png` / `game-apex.png`。
3. **微信 WebView 兼容基线**：继续使用 CSS Modules + 原生 CSS 变量 + 原生 `<select>` 起止选择器 + 原生 `<dialog>` + 剪贴板降级，不要引入 Tailwind v4 或复杂手势拖拽涂抹。
4. **保持推荐算法语义**：不得退化成「只对热力图每格人数求和」，必须保留 `src/domain/recommend.test.ts` 中的 2h vs 1h 反例测试全部通过。

---

## 3. 历史 Phase 2 实施清单（Fastify 备用方案）

建议按以下顺序推进后端与前后端联调：

1. **搭建 Fastify + SQLite WAL 服务端（如 `server/` 目录或同仓 workspace）**：
   - 使用 `fastify`、`@fastify/cookie`、`better-sqlite3`、`tsx` / `typescript`。
   - 直接引入或复用 `src/domain/recommend.ts` 中的 `normalizePicks` 做服务端区间归一化与合法性校验。
   - 按 [`API_CONTRACT.md`](./API_CONTRACT.md) 实现数据库初始化、5 个 `/api/rooms` 路由、`Origin` 校验、`HttpOnly` Cookie 签发与 `EventSource` SSE 广播器（带 `25s` 心跳）。
2. **打通前后端切换开关**：
   - 在 `vite.config.ts` 增加本地开发代理 `/api -> http://127.0.0.1:3000`。
   - 在 `src/App.tsx` 引入环境变量开关（例如 `VITE_USE_MOCK === 'true'` 时使用 `mockRoomClient` 并显示 `DemoToolbar`，默认或生产模式使用 `new HttpSseRoomClient('/api')`）。
3. **补齐后端并发与 SSE 测试**：
   - 测试 1：两位不同成员（不同 `member_token` Cookie）并发 `PUT /api/rooms/:id/me`，均返回 `200` 且 `roomRevision` 正确递增。
   - 测试 2：同一成员旧 `baseMineRevision` 并发写入返回 `409 REVISION_CONFLICT`，带相同 `mutationId` 重放返回 `200` 幂等结果。
   - 测试 3：SSE 推送 `event: revision` 与 `closed_at` 锁场后写接口返回 `410`。
4. **准备部署清单**：
   - 输出 `systemd` unit 文件与生产 `nginx.conf`（SSE 关闭 `proxy_buffering` 与 `gzip`）。
   - 用两台真机在微信内置浏览器实测：建房 → 群聊打开 → 填时段保存 → 切出微信聊天再切回自动同步 → 锁场只读。


## 最新接力任务

Cloudflare 代码、D1 migration、轮询和幂等修复已提交。请先实际执行 npm test、npm run typecheck 和 npm run build:cloudflare；验证 D1 数据库绑定与运行时密钥、首次迁移，再进行微信双机验收。不要将代码提交视为测试通过或已经上线。
