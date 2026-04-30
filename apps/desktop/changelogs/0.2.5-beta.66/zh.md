# OpenLoaf Desktop 0.2.5-beta.66

> 基础设施版本。自动更新产物开始同步到腾讯云 COS（除了原有的 Cloudflare R2），国内用户下载会更快。已安装的客户端继续从 R2 拉取，本版本对老用户行为无任何变化。

## 🚀 改进

- **R2 → R2 + 腾讯云 COS 双发布。** Server / web / desktop 三条发布管线现在会把所有产物和 manifest 同时写到 Cloudflare R2（海外）和腾讯云 COS（国内，走全球加速）。`TENCENT_*` secrets 没配置时 COS 那条腿会静默跳过，外部 fork 不受影响。
  - `apps/server/scripts/publish-update.mjs` 与 `apps/web/scripts/publish-update.mjs` 新增 `uploadFileToAll` / `uploadJsonToAll` + changelog 双写，对齐 desktop 已有实现。
  - 三个 publish workflow（`publish-server.yml` / `publish-web.yml` / `publish-desktop.yml`）的 R2 上传 step 同步注入了 `TENCENT_COS_*` / `TENCENT_SECRET_*` 变量。
- **COS 环境变量名与 OpenSpeech 对齐。** `scripts/shared/publishUtils.mjs` 与 `scripts/sync-r2-to-cos.mjs` 中的 `COS_*` 全部改为 `TENCENT_*`，便于跨项目复用同一套腾讯云凭证。本地 `.env.prod` 需要同步改名（见说明）。

## ℹ️ 说明

- 不涉及业务代码。Desktop 包重新构建只是为了走新的 CI 管线，功能上与 0.2.5-beta.65 完全一致。
- 默认更新地址未变 —— 仍是 `https://openloaf-update.hexems.com`（R2），老客户端继续正常自动更新。把新装客户端切到 COS 地址将在确认 COS 镜像完整后的下一个版本里完成。
- 本地继续用 `node scripts/sync-r2-to-cos.mjs` 的同学，把 `apps/desktop/.env.prod` 里 6 个 `COS_*` 键名改成 `TENCENT_*` 再跑。
