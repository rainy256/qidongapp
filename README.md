# 启动！ qidongapp

当前为 **阶段 1 设备兼容性验证工程**，不是正式三人约局产品。原站只读来源：[qidong @ b318ce5](https://github.com/rainy256/qidong/tree/b318ce568e217eb757dd5ff15f94df42e292636e)。不修改原仓库、Worker、数据库、域名。

## 测试 APK
[Actions](https://github.com/rainy256/qidongapp/actions) 的 Android probe 工作流生成 debug APK，下载 artifact 并解压安装。不同构建的 debug 签名可能不同，不可作为正式升级链。正式签名与 Releases 待后续完成。

## 测试后端
见 [部署与验收](docs/PROBE.md)。无测试后端配置时，APK 仍能测试安装、冷启动与 deep link，但不会伪造通知结果。
