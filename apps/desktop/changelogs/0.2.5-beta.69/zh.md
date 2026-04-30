# OpenLoaf Desktop 0.2.5-beta.69

> 新增对官网友好的聚合入口 `download.json`（stable 优先，没 stable 时回退到 beta）。官网可以永久 fetch 同一个 URL，不再需要随渠道切换。终端用户行为无变化。

## 🚀 改进

- **`download.json` 聚合入口。** 在 beta.68 引入的 `download-beta.json` / `download-stable.json` 之外，`publish-finalize` 步骤新增写入 `download.json`：
  - 发 **stable** 时无条件覆盖，`download.json` 内容 = 本次 stable
  - 发 **beta** 时仅当 R2 上不存在 `download-stable.json` 才写入 —— 这样发完 stable 后再发 beta，不会把官网首页拉回 beta
  - R2 + COS 双写
- 官网可以固定使用 `https://openloaf-1329813561.cos.accelerate.myqcloud.com/download.json`；想给 beta 测试用户独立链接的话还能继续用 `download-beta.json`。

## ℹ️ 说明

- 本次是首次写 `download.json`，因为还没发过 stable，所以内容当前 = beta 版本。一旦发了 stable，`download.json` 会切到 stable 并一直保持，直到下一个更新的 stable。
- schema 与 `download-{channel}.json` 完全一致，只是 URL 不同。
