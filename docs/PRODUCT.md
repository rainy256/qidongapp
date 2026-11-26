# 正式版阶段 2
独立于已部署的 qidongapp-probe。原站源码固定在 b318ce568e217eb757dd5ff15f94df42e292636e，由 vendor-original 工作流逐字节迁入 src/original、public/art 和 docs/upstream。旧房间页面及 mock 保留作为迁移参考，正式入口不得使用其接口、身份或模拟数据。

正式数据使用 qidongapp-db 的 app_ 前缀表，probe_ 表保持不变。正式 Worker 名称 qidongapp，禁止连接旧 qidong-db。先实现身份、即时邀请、日程底层与真实 API，再完善预约、通知队列、设置及签名。未配置正式后端、未完成测试不得发布正式 APK。

开发原则：所有写入基于服务端认证的 member id；客户端不得传入或选择自己的身份；激活码仅存哈希；凭证仅通过 Android Keystore 加密存储；业务状态由服务器确认。
