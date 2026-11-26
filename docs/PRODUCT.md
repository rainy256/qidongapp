# 正式版阶段 2
独立于已部署的 qidongapp-probe。原站源码固定在 b318ce568e217eb757dd5ff15f94df42e292636e，由 vendor-original 工作流逐字节迁入 src/original、public/art 和 docs/upstream。旧房间页面及 mock 保留作为迁移参考，正式入口不得使用其接口、身份或模拟数据。

正式数据使用 qidongapp-db 的 app_ 前缀表，probe_ 表保持不变。正式 Worker 名称 qidongapp，禁止连接旧 qidong-db。先实现身份、即时邀请、日程底层与真实 API，再完善预约、通知队列、设置及签名。未配置正式后端、未完成测试不得发布正式 APK。

开发原则：所有写入基于服务端认证的 member id；客户端不得传入或选择自己的身份；激活码仅存哈希；凭证仅通过 Android Keystore 加密存储；业务状态由服务器确认。

## 当前部署
正式基础 Worker 已独立部署： https://qidongapp.rainy256.workers.dev 。D1 已创建 app_members、app_invites、app_messages 及通知记录触发器，固定 m1–m3 三个占位身份，均未激活。激活码由管理员在安全环境生成 32 字节随机值并仅把 SHA-256 哈希写入对应未激活成员；禁止将明文提交到 Git。丢失激活响应或重装需要管理员安全重置该成员凭证，目前未提供自助恢复。
Android Keystore AES-GCM 原生插件已编写，产品构建配置单独生成 APK；不得用产品 APK 覆盖仍在验收的探针 APK，debug 签名可能冲突。浏览器只在当前内存保存凭证，不做持久化。正式外部推送、催促、预约、周模板、SPT 绑定、版本检查尚未实现。业务端到端和真机测试未验证。

## 通知及预约开发
新增 SPT 绑定/解绑、测试推送与实际确认、免打扰、持久化 outbox、指定成员催促、预约创建/确认/改期/取消、预约冲突及提前十分钟提醒。仅明确 HTTP 429 做退避重试，结果未知不自动重发，防止重复。正式 SPT_ENCRYPTION_KEY 需在正式 Worker Secret 中设置 64 位随机十六进制值，不能公开，不得复用探针 Secret。预约和通知实际端到端仍需测试；周模板、正式签名更新待完成。