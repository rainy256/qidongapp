# 后端数据模型与 API / SSE 契约（方案 A）

下方为 Fastify 备用方案的原始接口与数据库说明，Cloudflare 主方案差异见本文末尾及 [CLOUDFLARE.md](CLOUDFLARE.md)。

本文档定义 Phase 2 **Fastify + SQLite (WAL) + SSE + Nginx** 后端必须严格遵循的数据结构与同源接口契约。  
前端 [`src/api/httpSseClient.ts`](../src/api/httpSseClient.ts) 已按以下契约编写完毕，后端对齐后即可零改动切换。

---

## 1. SQLite 数据库 DDL（WAL 模式）

启动时执行 PRAGMA：

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

### 1.1 `rooms` 表

```sql
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,                 -- 高熵随机短 ID（建议 >= 12 位 base62 / nanoid）
  title TEXT NOT NULL,                 -- 房间标题（<= 32 字）
  game_tag TEXT,                       -- 可选：'apex' | 'gta' | 'tarkov' | 'custom'
  owner_token_hash TEXT NOT NULL,      -- SHA-256(owner_token + pepper)
  tzid TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  nights_json TEXT NOT NULL,           -- JSON: Night[] = [{ id, dateKey, from, to }]
  target_players INTEGER NOT NULL,     -- 2..10
  duration_slots INTEGER NOT NULL,     -- 半小时格数（正整数，如 4 = 2 小时）
  room_revision INTEGER NOT NULL DEFAULT 1,
  closed_at TEXT,                      -- ISO 8601 UTC，NULL 表示收集中
  expires_at TEXT NOT NULL,            -- 自动清理时间（如建房后 30 天）
  created_at TEXT NOT NULL
);
```

### 1.2 `participants` 表

> **注意**：仅当用户首次点击「保存」时才在事务中插入记录；单纯打开 `/r/:id` 浏览或微信爬虫预览绝不创建记录。

```sql
CREATE TABLE IF NOT EXISTS participants (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                    -- 公开成员 ID（如 'm_xxx'）
  member_token_hash TEXT NOT NULL,     -- SHA-256(member_token + pepper)
  nickname TEXT NOT NULL,
  answer_kind TEXT NOT NULL CHECK (answer_kind IN ('available', 'unavailable')),
  picks_json TEXT NOT NULL,            -- JSON: Pick[] = [{ nightId, from, to }]，unavailable 时为 '[]'
  participant_rev INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, id),
  UNIQUE (room_id, member_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);
```

### 1.3 `mutations` 表（幂等重试保护）

```sql
CREATE TABLE IF NOT EXISTS mutations (
  scope TEXT NOT NULL,                 -- 'create' | 'save:<roomId>:<memberTokenHash>' | 'close:<roomId>'
  mutation_id TEXT NOT NULL,
  room_revision INTEGER NOT NULL,
  room_id TEXT,                        -- 关联房间 ID（建房幂等重放时用于找回已创建房间）
  request_hash TEXT,                   -- SHA-256(规范化请求内容)，防止同 mutation_id 被不同请求体误复用
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, mutation_id)
);
```

### 1.4 `schema_migrations` 表（版本化迁移）

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

---

## 2. 身份凭证与安全规范

- **Cookie 作用域与属性**：
  - `yj_owner_<roomId>`（或统一签名会话 Cookie）：`HttpOnly; Secure; SameSite=Lax; Path=/api/rooms/<roomId>`（建房 `POST /api/rooms` 时下发）
  - `yj_member`（全局高熵随机成员凭证，用于在同一浏览器自动认出本人跨房间或单房间身份）：`HttpOnly; Secure; SameSite=Lax; Path=/`
  - 若 `GET /api/rooms/:id` 检测到请求未带 `yj_member`，可签发新 `yj_member` Cookie，但**此时不写入 `participants` 表**。
- **CSRF 防护**：所有 `POST` / `PUT` / `DELETE` 接口必须校验请求头 `Origin`（或缺失时兜底校验同源 `Referer`），不匹配部署域名直接返回 `403`（`ORIGIN_FORBIDDEN`）。
- **统一错误响应格式**：所有 `4xx` / `5xx` 错误统一返回：
  ```json
  { "error": { "code": "REVISION_CONFLICT", "message": "你在其他设备或窗口已经更新过填写，请先刷新查看最新内容。" } }
  ```
  常用业务 `code` 包括：`INVALID_INPUT` (`400`)、`ORIGIN_FORBIDDEN` (`403`)、`OWNER_REQUIRED` (`403`)、`NOT_FOUND` (`404`)、`REVISION_CONFLICT` (`409`)、`IDEMPOTENCY_CONFLICT` (`409`)、`ROOM_CLOSED` (`410`)。
- **房主也能提交时段**：若房主同时作为玩家参与填写，房主凭证与成员凭证互不干扰，`viewer.canClose = true` 与 `viewer.memberId` 可同时返回。

---

## 3. 五个同源 HTTP / SSE 接口契约

所有时间格点 `from` / `to` 为基于 Unix Epoch 的半小时整数 `Slot`（`Math.floor(utcMs / 1_800_000)`），区间左闭右开 `[from, to)`。

### 3.1 共享响应体：`RoomSnapshot`

对应 [`src/domain/types.ts`](../src/domain/types.ts)：

```json
{
  "id": "r-k8m2x9p1q4",
  "title": "周五晚塔科夫五人车",
  "gameTag": "tarkov",
  "tzid": "Asia/Shanghai",
  "nights": [
    { "id": "n_20261127", "dateKey": "2026-11-27", "from": 995670, "to": 995682 }
  ],
  "targetPlayers": 5,
  "durationSlots": 4,
  "roomRevision": 6,
  "closedAt": null,
  "submissions": [
    {
      "memberId": "m_azhe",
      "nickname": "阿哲",
      "answer": {
        "kind": "available",
        "picks": [
          { "nightId": "n_20261127", "from": 995672, "to": 995679 }
        ]
      },
      "updatedAt": "2026-11-27T11:10:00.000Z"
    }
  ],
  "viewer": {
    "memberId": null,
    "canClose": false,
    "mineRevision": 0
  },
  "syncedAt": "2026-11-27T11:42:00.000Z"
}
```

> **响应头要求**：`GET /api/rooms/:id` 必须返回 `Cache-Control: private, no-store`，避免微信 WebView 或代理缓存返回旧版本的 `viewer` / `roomRevision`。

---

### 3.2 `POST /api/rooms`（建房）

- **请求体**：
  ```json
  {
    "title": "周五晚 Apex 三排",
    "gameTag": "apex",
    "nights": [
      { "id": "n_20261127", "dateKey": "2026-11-27", "from": 995670, "to": 995684 }
    ],
    "targetPlayers": 3,
    "durationSlots": 4,
    "mutationId": "create_8x2k1a"
  }
  ```
- **服务端校验**：
  - `title` 非空且 `<= 32` 字；`targetPlayers` 为 `2..10` 整数；`durationSlots` 为 `1..16` 整数；`nights` 数量 `1..7`，且每个夜晚 `to > from` 且 `to - from >= durationSlots`。
- **响应**：`201 Created`（幂等重放返回 `200`），写入 `owner_token` Cookie，返回 `RoomSnapshot`（其中 `viewer.canClose = true`）。

---

### 3.3 `GET /api/rooms/:id`（获取一致房间快照）

- **响应**：
  - `200 OK` + `Cache-Control: private, no-store` + `RoomSnapshot`。
  - `404 Not Found`：房间不存在或已过期。

---

### 3.4 `PUT /api/rooms/:id/me`（提交或修改本人时段）

- **请求体**：
  ```json
  {
    "nickname": "阿九",
    "answer": {
      "kind": "available",
      "picks": [
        { "nightId": "n_20261127", "from": 995672, "to": 995678 }
      ]
    },
    "baseMineRevision": 0,
    "mutationId": "save_1795531000_ab12"
  }
  ```
- **事务逻辑（单事务原子执行）**：
  1. 若房间不存在 → `404`；若 `closed_at IS NOT NULL` → `410 Gone` (`ROOM_CLOSED`)。
  2. 检查 `mutations` 表是否命中 `(save:<roomId>:<memberTokenHash>, mutationId)`；命中则直接返回最新快照（幂等）。
  3. 校验 `nickname` 非空（`<= 20` 字）；若 `answer.kind === 'available'`，将 `picks` 裁剪并归并到对应 `night` 合法半小时格内（复用 `normalizePicks`），非空校验通过后再入库；若 `unavailable` 则存 `'[]'`。
  4. 查询当前成员记录：
     - 若不存在且 `baseMineRevision !== 0` → `409 Conflict` (`REVISION_CONFLICT`)。
     - 若已存在且 `participant_rev !== baseMineRevision` → `409 Conflict` (`REVISION_CONFLICT`)。
  5. 插入/更新 `participants`（递增 `participant_rev`），递增 `rooms.room_revision`，写入 `mutations`。
  6. **事务提交成功之后**，向内存订阅者广播新 `room_revision` 并返回 `200 OK` + 最新 `RoomSnapshot`。

---

### 3.5 `GET /api/rooms/:id/events?afterRevision=<n>`（SSE 事件流）

- **响应头**：
  ```http
  Content-Type: text/event-stream; charset=utf-8
  Cache-Control: no-cache, no-transform
  Connection: keep-alive
  X-Accel-Buffering: no
  ```
- **事件格式**：
  - 建连时若当前 `room_revision > afterRevision`，立刻下发一次：
    ```text
    event: revision
    data: {"roomRevision":7}

    ```
  - 每次有人 `saveMine` 或 `closeRoom` 提交事务后推送同一格式事件。
  - 每 `25s` 发送一行 SSE 注释心跳 `: ping\n\n` 防止移动网关/Nginx 断开空闲连接。

---

### 3.6 `PUT /api/rooms/:id/closure`（房主结束收集）

- **请求体**：`{ "mutationId": "close_1795531999_xy89" }`
- **校验与行为**：
  - 仅校验 `owner_token_hash` 匹配者可执行，否则 `403 Forbidden`（`OWNER_REQUIRED`）。
  - 原子更新 `closed_at = COALESCE(closed_at, ?)` 并递增 `room_revision`，写入 `mutations`，提交后广播新 `roomRevision`，返回 `200 OK` + `RoomSnapshot`。

### 3.7 健康与就绪探针

- `GET /healthz`：检查服务进程存活，返回 `200 { "ok": true, "status": "alive" }`。
- `GET /readyz`：检查 SQLite 数据库读写与 WAL 模式就绪，返回 `200 { "ok": true, "status": "ready", "journalMode": "wal" }`（异常时返回 `503`）。
- `GET /api/health`：通过 Nginx `/api/` 转发的健康探针，返回 `200 { "ok": true }`。

---

## 4. Nginx 同域反代参考配置

```nginx
server {
    listen 443 ssl http2;
    server_name yueju.example.com;

    root /var/www/yueju-web/dist;
    index index.html;

    # SSE 事件流：务必关闭代理缓冲与压缩
    location ~ ^/api/rooms/[^/]+/events$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_read_timeout 120s;
    }

    # 普通 REST API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA 前端路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```


## 当前接口修订（适用于新客户端）

- GET /api/session：先建立匿名会话，再发起建房或首次保存；浏览不创建成员。未建立会话的写入返回 401 SESSION_REQUIRED。
- mutationId：客户端使用 128 bit 密码学随机值（32 位十六进制）；同一请求重试保持原值和原 baseMineRevision，改变内容时使用新值。
- 创建幂等范围限定在原匿名会话内，不能凭其他人的 mutationId 取得权限；同一会话丢失创建响应后可重试获得房主权限。Fastify 重放也重新签发 owner Cookie。
- 成功保存的相同请求可以在关闭收集后重放；全新保存仍返回 410。
- Cloudflare：GET /api/health 返回 syncMode: poll；前端直接每 6 秒 GET /api/rooms/:id，不连接 SSE；events 路由返回 204。使用 D1 的 worker/migrations/0001_initial.sql，不使用上面的本地 WAL schema。
- Cloudflare 会话 Cookie 为 __Host-yj_cloud_session，房主与成员由 HMAC 派生；清除 Cookie、换浏览器或换域名不自动恢复。RoomSnapshot 及其余业务 API 维持相同契约。
