# 启动！ qidongapp

「启动！」是给固定三人小队用的 Android 开黑约局 App。想现在开一局，就选游戏发车，让队友在车票里回复什么时候到。想提前约，就在日程里找三个人都有空的时间。

## 安装与登录

1. 到[最新正式版](https://github.com/rainy256/qidongapp/releases/latest)下载 `qidongapp.apk`。发布页也提供 `qidongapp.apk.sha256` 供校验。已经装过正式版的成员，直接覆盖安装即可保留登录状态。
2. 打开 App，选择自己的固定成员身份，输入个人口令。首次登录可使用管理员发给本人的激活码。已在旧设备激活、还没设置长期口令的成员，换机前先在旧设备的「我的」里设置长期口令。
3. 想收到队友的邀请和预约提醒，在「我的」绑定个人 WxPusher SPT，点「发送测试通知」确认能收到。后续升级也可以在「我的」点「检查更新」。

## 怎么约一局

| 想做什么 | 在 App 里怎么做 |
| --- | --- |
| 现在喊人 | 在首页选游戏，点「立即启动」发出车票。队友可以直接回复，也可以选 5、10 或 30 分钟后到。即使大家都没填日程或可喊状态，也能发车。 |
| 告诉队友现在方便 | 点「我现在可喊」，设置截止时间。首页会显示每个人可喊到几点，也可以提前结束自己的状态。 |
| 找时间提前约 | 在「日程」填写未来七天的空闲，固定有空的时段可以存成每周模板。页面列出三人连续至少一小时的共同空闲，可据此发起预约。改期后需要三人重新确认。 |
| 从通知回到 App | 点 WxPusher 通知里的链接，再点「打开 App」进入对应车票或页面。需要安静时，可以在「我的」设置免打扰时段。 |

日程按北京时间计算，每个日程日从早上 06:00 到次日 06:00。周六凌晨 01:00 的空闲要填在周五这一栏。

## 本地开发

正式客户端使用 React、Vite 和 Capacitor，源码在 [product/](product/)。后端使用 Cloudflare Workers 和 D1，[product/worker/](product/worker/) 包含业务接口、通知任务和数据库迁移。

在仓库根目录使用 Node.js 22 和 Python 3 运行：

```sh
npm install
npm run test:product    # 产品测试，含数据库迁移与请求处理
npm run build:product   # 构建 APK 内嵌前端，输出到 dist-product/
npm run build:worker    # 在本地打包 Worker
```

构建调试 APK 还需要 JDK 21 和 Android SDK 35。生成 Android 工程、应用原生补丁及运行 Gradle 的完整命令见[产品构建工作流](.github/workflows/product-check.yml)。

## 发布与维护

- **签名与发布**：[候选版工作流](.github/workflows/android-candidate.yml)读取 `product/CANDIDATE_VERSION`，与上一正式包比对签名、包名和版本号，生成验收包。在 `main` 更新 `product/RELEASE_VERSION` 会触发[正式发布工作流](.github/workflows/android-release.yml)，将签名 APK 和 SHA-256 校验文件上传到 GitHub Releases。
- **后端与通知**：APK 通过 `/app-api/` 访问后端。通知保留 `/game/:id` 和 `/open/:page` 两类 HTTPS 跳转入口。部署、账号和推送配置见[产品文档](docs/PRODUCT.md)。
- **项目记录**：[优化建议与实施状态](docs/OPTIMIZATION.md)记录主分支的改进进度。[设备兼容性探针](docs/PROBE.md)保留早期安装、通知和跳转的验证方法。
