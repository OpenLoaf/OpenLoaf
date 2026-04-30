# OpenLoaf Desktop 0.2.5-beta.67

> 自动更新默认地址切到腾讯云 COS，国内新装用户下载会明显更快。Cloudflare R2 镜像继续同步每个版本，老用户和海外用户不受影响。

## 🚀 改进

- **默认更新地址切到腾讯云 COS。** 新安装的客户端，无论是 Electron 自动更新还是内嵌 Web UI 检查更新，默认都解析到 `https://openloaf-1329813561.cos.accelerate.myqcloud.com`。CI 仍会同时发布到 R2 + COS，所以原 `https://openloaf-update.hexems.com` 镜像继续可用，已经通过 `OPENLOAF_UPDATE_URL` 锁定该地址的客户端不受影响。
- **`@openloaf-saas/sdk` 升级到 ^0.3.9**（server / web / packages/api 全部同步）。带上游 chat / media-task 修复，OpenLoaf 这一侧没有 API 变更。

## 🐛 修复

- **首次渲染时多余的 branch snapshot 请求。** `ChatCoreProvider` / `useChatBranchState` 现在会先等 `sessionId` 完成解析再发起 tRPC 查询。之前在 sessionId 还没就绪时就会发一次空 id 请求，服务端日志里会出现一条无关的 400。

## ℹ️ 说明

- 已安装的老版本（≤ 0.2.5-beta.65）仍从 R2 拉更新，会继续收到所有后续版本——切换是"重装才生效"，不是强制迁移。
- 需要自定义更新地址（企业代理 / 预发环境等）的同学，仍可以通过环境变量 `OPENLOAF_UPDATE_URL` 或 `runtime.env` 覆盖，优先级高于新的 COS 默认值。
