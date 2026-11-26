# 交接
当前仅第一阶段探针，禁止将其作为正式产品。已通过 GitHub 读取原站 README、项目规划、交接、API、Cloudflare 文档及推荐、时间、配色文件；尚未完成全仓读取。CI 固定源版本并输出完整路径清单，复制原始 public/art 和 tokens.css，未复制原 Worker 或数据库配置。CI 第三轮已实际通过依赖安装、四个模拟推送单测、TypeScript/Vite 编译、Capacitor Android 生成与同步；Gradle APK 构建及上传结果请查看 [实际运行](https://github.com/rainy256/qidongapp/actions/runs/45761761044)。前两轮分别因已废弃的 SDK tools 包及 SDK PATH 问题失败，第三轮显式安装 SDK 35 包后解决。独立 D1 与测试 Worker 已创建；尚无 SPT、正式签名及真机验收。

当前测试服务只用于验证通知及链接，不包含任何业务数据。测试阶段的 HTTPS 页面公开且仅有固定 probe 跳转；正式游戏 HTTPS 入口必须认证。当前本地 Git clone 受网络限制，所有真实构建通过 GitHub Actions 进行；原站素材的 CI 复制已成功，未在新仓库持久化全量素材和组件。

后续顺序：先通过设备验收；把原站全部素材、组件、算法及测试实际迁入新仓库并检查无绿色；复用原推荐算法的连续全程交集；实现固定成员一次性激活和 Android Keystore 凭证；独立 D1/Worker；即时邀请和回复、预约、日程、消息、SPT 加密与 outbox/Cron、免打扰；前台 6/3 秒轮询；签名发布及版本检查。正式版禁止使用探针测试凭证或公开测试入口作为业务认证。
