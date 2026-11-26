# 第一阶段：兼容性验证

这不是正式业务服务。测试凭证独立于未来一次性激活码，仅用于测试；测试 SPT 暂存在 Cloudflare Secret，不进入数据库、不通过 API 返回。正式产品必须替换为加密 D1 持久化绑定、身份授权和持久化发送队列。测试限流为每人每分钟一次。

## 已创建的云端资源（2026-11-26）
独立 D1 `qidongapp-db` 已创建（APAC），已实际执行 `0001_probe.sql` 并确认 `probe_rate` 表存在。Worker `qidongapp-probe` 已上传且 workers.dev 子域启用。默认地址：https://qidongapp-probe.rainy256.workers.dev 。尚未设置 PROBE_MEMBERS，未验证公网访问和真实通知。

以下 1–3 步为重建参考，现有环境不要重复创建数据库；从第 4 步配置 Secret 开始。

## 配置测试服务
1. 仅创建新的 D1：`npx wrangler@4 d1 create qidongapp-db`。禁止复用 qidong-db。
2. 复制 wrangler.probe.example.jsonc 到本地 wrangler.probe.jsonc，填写新数据库 ID。
3. 执行 `npx wrangler@4 d1 migrations apply DB --remote --config wrangler.probe.jsonc`，再执行 `npx wrangler@4 deploy --config wrangler.probe.jsonc`。
4. 三人各自按 [WxPusher 官方说明](https://wxpusher.zjiecode.com/docs/spt.html) 获取 SPT。管理员私下生成每人独立随机测试凭证（至少 32 字节随机数据，base64url 或 hex）；计算各自 SHA256 小写 hex。通过 Cloudflare 控制台设置 Secret PROBE_MEMBERS，值为含三项的 JSON 数组，每项有 id（m1/m2/m3）、hash（测试凭证哈希）、spt（个人 SPT）。不要把真实值写入 Git、日志或聊天。测试凭证私下分发。
5. CI 默认使用已部署的测试 Worker。仅在地址改变时，在 GitHub 仓库 Settings / Secrets and variables / Actions / Variables 设置 VITE_PROBE_API 为新的 HTTPS origin（不带路径），重新手动运行 Android probe。
6. 下载 artifact 解压 APK，三台设备安装。未配置 Worker 时只测安装与链接。
7. 用个人测试凭证发两种通知，确认实际收到；接口受理不等于送达。WxPusher 通知点开第三方 App 可能需要用户设置。
8. 测试完删除 PROBE_MEMBERS，停用测试 Worker；保留新 D1 给正式工程迁移。

## 验收记录（未执行）
|设备|安装/启动|锁屏通知|App 被关闭后通知|Scheme 冷/热启动|HTTPS 入口|
|---|---|---|---|---|---|
|鸿蒙 4.2|待测|待测|待测|待测|待测|
|一加 ColorOS|待测|待测|待测|待测|待测|
|鸿蒙 7 + 卓易通|待测|待测|待测|待测|待测|

ADB 可用时执行：`adb shell am start -a android.intent.action.VIEW -d qidongapp://game/probe com.rainy256.qidongapp`。链接只包含公开测试编号。正式 HTTPS 游戏入口必须先认证再读取数据。
