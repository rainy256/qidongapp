# 正式版阶段 2
独立于已部署的 qidongapp-probe。原站源码固定在 b318ce568e217eb757dd5ff15f94df42e292636e，由 vendor-original 工作流逐字节迁入 src/original、public/art 和 docs/upstream。旧房间页面及 mock 保留作为迁移参考，正式入口不得使用其接口、身份或模拟数据。

正式数据使用 qidongapp-db 的 app_ 前缀表，probe_ 表保持不变。正式 Worker 名称 qidongapp，禁止连接旧 qidong-db。先实现身份、即时邀请、日程底层与真实 API，再完善预约、通知队列、设置及签名。未配置正式后端、未完成测试不得发布正式 APK。

开发原则：所有写入基于服务端认证的 member id；客户端不得传入或选择自己的身份；激活码仅存哈希；凭证仅通过 Android Keystore 加密存储；业务状态由服务器确认。

## 当前部署
正式基础 Worker 已独立部署： https://qidongapp.rainy256.workers.dev 。D1 已创建 app_members、app_invites、app_messages 及通知记录触发器，固定 m1–m3 三个占位身份，均未激活。激活码由管理员在安全环境生成 32 字节随机值并仅把 SHA-256 哈希写入对应未激活成员；禁止将明文提交到 Git。丢失激活响应或重装需要管理员安全重置该成员凭证，目前未提供自助恢复。
Android Keystore AES-GCM 原生插件已编写，产品构建配置单独生成 APK；不得用产品 APK 覆盖仍在验收的探针 APK，debug 签名可能冲突。浏览器只在当前内存保存凭证，不做持久化。上述功能在后续提交已接入；以下新增章节为当前配置说明。业务端到端和真机测试未验证。

## 通知及预约开发
新增 SPT 绑定/解绑、测试推送与实际确认、免打扰、持久化 outbox、指定成员催促、预约创建/确认/改期/取消、预约冲突及提前十分钟提醒。仅明确 HTTP 429 做退避重试，结果未知不自动重发，防止重复。正式 SPT_ENCRYPTION_KEY 需在正式 Worker Secret 中设置 64 位随机十六进制值，不能公开，不得复用探针 Secret。预约和通知实际端到端仍需测试；周模板和签名发布配置在后续提交已接入。
## 正式签名与升级
在 GitHub Actions Secrets 设 ANDROID_KEYSTORE_BASE64、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。请在自己的可信电脑生成并备份长期发布密钥；不能提交密钥、密码或真实 SPT。打语义版本 tag（例如 v0.1.0）触发签名工作流，运行全部测试、构建 release、apksigner 校验、上传 SHA256 后发布 GitHub Release。签名配置未完成前不能正式发布。所有升级使用同一签名；debug 探针和正式签名不能直接覆盖，卸载前先完成探针验收。
版本检测读取本仓库正式 Release，只有版本更高且存在预定 APK 资产才提供下载，不将预发布或 debug artifact 视作正式更新。

## 激活和通知配置
管理员在 Cloudflare D1 控制台为 m1/m2/m3 单独写入高熵一次性激活码的 SHA256 哈希（明文仅私下交给本人）。未激活身份不可使用正式 API。通过正式 Worker Secret 配置 SPT_ENCRYPTION_KEY，值为 32 字节随机数据的 64 位十六进制形式（例如本地 openssl rand -hex 32，妥善备份，不要将实际值提交）。App 内各人自行绑定 SPT，测试推送并确认实际收到。原 probe SPT 不自动迁移。更换密钥前须安排密文迁移，不可直接覆盖。 

激活码本地生成：`node product/scripts/issue-activation.mjs m1`（m2、m3 同理），仅将打印的 SQL 执行于正式 D1，并将明文单独发给对应成员。脚本不会连接云端，不得把输出作为 CI artifact 或提交至 Git。

## Windows 一键签名配置
安装 JDK 21 和 GitHub CLI，使用自己的 GitHub 管理员账号运行 `powershell -File product/scripts/setup-signing.ps1`（按本机 PowerShell 策略允许已审查的本地脚本）。脚本仅在四项签名 Secrets 均不存在时配置首次发布，若已存在则拒绝覆盖。密钥默认保存在用户目录 qidongapp-signing，密码由本人设置，不写入代码。脚本若中途失败，请保留本地 JKS，核对已有 Secrets 后补齐，禁止生成替换密钥。脚本仅验证 Secret 名称，真实签名以发布工作流为准。

用户确认探针延时提醒已收到；鸿蒙7可原生运行 WxPusher，无需用卓易通运行 WxPusher。qidongapp APK 在鸿蒙7自身安装、跳转仍需验收。

## 简化版签名（推荐，覆盖前述四项配置步骤）
三个成员共用同一固定发布签名。仅配置一个 Actions Secret `ANDROID_SIGNING_BUNDLE`（Base64 封装的 JSON：version=1, keystore, password, alias, keyPassword）；它含完整私钥及密码，必须私下备份，不得提交源码。旧四项 Secrets 作为兼容回退，不必同时配置。正式签名工作流从 main 手动输入 vX.Y.Z 即可，签名成功后创建 tag 并发布 APK。可以先手动运行 Check signing configuration 验证 Secret 格式；真正签名及覆盖升级仍需实测。不得更换已经用于正式发布的密钥。探针 Debug APK 与正式签名不同，不能直接覆盖。

## 版本号触发发布
修改 main 上的 `product/RELEASE_VERSION` 为新的 `vX.Y.Z` 可触发正式签名发布；工作流也保留手动和 tag 触发入口。同一版本不可覆盖已有 Release，签名完成且验证成功后才发布。首次申请发布 v0.1.0，签名 Secret 由仓库所有者自行配置，仍需以工作流实际结果为准。

## 成员激活界面（待下一次 APK 发布）
新界面先选固定成员，再粘贴本人专属一次性口令；服务器同时核验成员与口令匹配，兼容旧 APK 无 memberId 的请求。管理员本地签发工具生成 128 位随机口令（32 个十六进制字符），无需改数据库结构。现有 64 字符口令仍兼容；数据库只保存 SHA-256。签发及 SPT 加密密钥配置必须由有权限的管理员在安全环境完成，此提交不写入任何真实口令或密钥，不重置已激活成员。

## 鸿蒙 PWA
独立地址 `https://qidongapp.rainy256.workers.dev/app/`，由同一正式 Worker 提供入口与 API。GitHub Actions `Publish PWA static build` 构建至 `dist-pwa` 并发布独立 `pwa-static` 分支；Worker 仅向固定公开分支读取白名单静态文件，不转发认证头或 Cookie，不依赖浏览器直连 GitHub。APK 构建保持原路径。网页激活用 HttpOnly/Secure/SameSite=Strict Cookie（API 路径），写操作必须同源 JSON；旧 APK 仍用原 Bearer。通知入口可选择网页或 APK。PWA 清除浏览器数据可能需要管理员重新授权；同一成员仍为单设备授权，尚无多设备绑定。Service Worker 只缓存离线提示，不缓存私人数据，联网方可约局。鸿蒙浏览器是否支持独立窗口/桌面安装需真机确认。签发口令与 SPT 加密密钥仍需安全初始化，不由网页公开配置。
