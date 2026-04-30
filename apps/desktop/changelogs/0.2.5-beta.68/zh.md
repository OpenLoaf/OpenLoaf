# OpenLoaf Desktop 0.2.5-beta.68

> 新增对官网友好的 `download-{channel}.json` 下载清单，官网 fetch 一份 JSON 即可铺满下载按钮。终端用户行为无变化。

## 🚀 改进

- **每次发版自动写 `download-beta.json` / `download-stable.json`。** `publish-update.mjs` 的 `--manifest-only` 收尾步骤新增写入一份扁平 JSON，包含最新 desktop 版本号、各平台安装包直链（dmg / exe / AppImage）、R2 + COS 双镜像 URL、GitHub Release 链接，以及打包内嵌的 web / server 版本号。访问地址：
  - `https://openloaf-1329813561.cos.accelerate.myqcloud.com/download-beta.json`
  - `https://openloaf-update.hexems.com/download-beta.json`
  - 下次发 stable 时还会生成 `…/download-stable.json`
- 每次 finalize 重新生成，R2 + COS 同步双写，`url` 字段默认走 COS 国内加速，国内官网默认拿到加速链接。

## ℹ️ 说明

- schema 故意保持扁平，并暴露 `mirrors.{cos,r2,github}`，官网可以直接 `fetch('/download-beta.json').then(r => r.json())` 拿到所有信息。
- 用户下载用的 dmg/exe/AppImage 的 `sha256` 暂时是 `null`——electron-updater 校验走 `.blockmap` / sha512 通道。如果官网需要"完整性校验"展示，可以在每平台上传时补采 sha256。
