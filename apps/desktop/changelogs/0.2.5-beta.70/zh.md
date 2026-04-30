# OpenLoaf Desktop 0.2.5-beta.70

> 修复发布管线。beta.69 的安装包和 manifest 都正常上传到了 COS / R2，但 `publish-finalize` 末尾的清理步骤在 COS 上失败，连带 GitHub Release 创建被跳过。通过 `download.json` 拉到的下载链接对最终用户完全可用；本次发版恢复 GitHub Release 链路。

## 🐛 修复

- **`publish-finalize` 清理步骤兼容腾讯 COS。** 共享的 `cleanupOldVersions` 之前用 `DeleteObjectsCommand`（一次最多 1000 个 key）批量删，在 R2 / 原生 S3 上都没问题，但 COS 报 `InvalidRequest: Missing required header for this request: Content-MD5`。AWS SDK v3 已经把自动 Content-MD5 换成了 `x-amz-sdk-checksum-algorithm`，COS 还没认这个新头。改成 `DeleteObjectCommand` 单个删 + 小并发，兼容 R2 / COS / 原生 S3，每次发版只多花几秒。

## ℹ️ 说明

- beta.69 本身在官网 / `download.json` / 直接 COS / R2 链接上完全可用，只是 GitHub Release 那一页没创建；本版本恢复 GitHub Release 流程。
- 无业务代码变化。
