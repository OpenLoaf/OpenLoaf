# 发布流程与版本管理

## 版本号约定

- 三个独立版本号：`apps/server/package.json`、`apps/web/package.json`、`apps/desktop/package.json`
- 语义化版本 + prerelease 标签：`1.0.0`（stable）、`1.0.1-beta.1`（beta）
- 版本号含 `-beta` 自动归入 beta 渠道

## 发布命令

### Server 增量更新

```bash
# stable 发布
cd apps/server
npm version patch                # 1.0.0 → 1.0.1
node scripts/publish-update.mjs  # 自动 stable

# beta 发布
npm version prerelease --preid=beta  # 1.0.1 → 1.0.2-beta.0
node scripts/publish-update.mjs      # 自动 beta

# 强制指定渠道
node scripts/publish-update.mjs --channel=stable
```

### Web 增量更新

```bash
cd apps/web
npm version patch
node scripts/publish-update.mjs
```

### Electron 本体发布

```bash
cd apps/desktop
pnpm run dist:production    # package + sign + notarize + upload
```

## 发布脚本流程（Server 示例）

1. 读取 `package.json` 版本号
2. 解析渠道（CLI `--channel=xxx` > 版本号推断）
3. `node scripts/build-prod.mjs` 构建 `dist/server.mjs`
4. gzip 压缩（level 9）→ `dist/server.mjs.gz`
5. SHA-256 计算
6. 上传构件到 R2：`server/${version}/server.mjs.gz`（共享池，不分渠道）
7. 更新 `${channel}/manifest.json`（包含 `changelogUrl`）
8. 上传 `changelogs/` 目录到 `changelogs/server/*.md`
9. 更新 `changelogs/index.json`

## R2 目录结构

```
r2-openloaf-update.hexems.com/
├── stable/manifest.json         # stable 渠道增量更新清单
├── beta/manifest.json           # beta 渠道增量更新清单
├── manifest.json                # 旧格式（已废弃，过渡期保留）
├── electron/                    # Electron 本体更新（不分渠道）
│   ├── latest-mac.yml
│   ├── OpenLoaf-1.0.0-arm64.dmg
│   └── OpenLoaf-1.0.0-arm64-mac.zip
├── server/                      # Server 构件共享池
│   ├── 1.0.0/server.mjs.gz
│   └── 1.0.1-beta.1/server.mjs.gz
├── web/                         # Web 构件共享池
│   ├── 0.1.0/web.tar.gz
│   └── 0.1.1-beta.1/web.tar.gz
└── changelogs/                  # 更新日志
    ├── index.json
    ├── server/1.0.0.md
    ├── web/0.1.0.md
    └── desktop/1.0.0.md
```

构件按版本号存储在共享池，beta 版"转正"只需将 stable/manifest.json 指向同一 URL。

## Changelog 文件格式

放在各 app 的 `changelogs/` 目录下：

```markdown
---
version: 1.0.1
date: 2026-02-08
commitId: 9f7d1b84c2fec4488ba54ba90a806982d8fa4cc6
---

## 新功能
- 添加了 XX 功能

## 修复
- 修复了 YY 问题
```

- 目录结构：`changelogs/{version}/{lang}.md`（如 `changelogs/0.1.0/zh.md`、`changelogs/0.1.0/en.md`）
- 每个版本必须有 `zh.md`（默认语言），`en.md` 等其他语言可选
- `version` 字段不需要 `channel`（从版本号推断）
- `commitId` 字段记录该版本发布时的 git commit hash（完整 40 字符），用于下次发布时确定 commit 范围
- 发布时所有 changelog 文件都会上传到 R2
- manifest 中 `changelogUrl` 不含语言后缀和扩展名（客户端拼接 `.{lang}.md`）

## changelogs/index.json

```json
{
  "server": [
    { "version": "1.0.1-beta.1", "date": "2026-02-08", "langs": ["zh", "en"] },
    { "version": "0.1.0", "date": "2026-02-07", "langs": ["zh", "en"] }
  ],
  "web": [...],
  "electron": [...]
}
```

## 共享工具模块

`scripts/shared/publishUtils.mjs` 导出：

| 函数 | 用途 |
|------|------|
| `loadEnvFile(path)` | 加载 .env 文件 |
| `validateR2Config()` | 校验 R2_* 环境变量并返回配置 |
| `createS3Client(config)` | 创建 S3/R2 客户端 |
| `uploadFile(s3, bucket, key, path)` | 上传文件 |
| `downloadJson(s3, bucket, key)` | 下载 JSON |
| `uploadJson(s3, bucket, key, data)` | 上传 JSON |
| `computeSha256(path)` | SHA-256 哈希 |
| `detectChannel(version)` | 版本号推断渠道 |
| `resolveChannel(args, version)` | CLI 参数 > 自动推断 |
| `uploadChangelogs(opts)` | 上传 changelogs 并更新 index.json |
| `buildChangelogUrl(url, component, version)` | 生成 changelog URL |

## 环境变量

发布脚本需要以下变量（来自 `.env.prod`）：

| 变量 | 说明 |
|------|------|
| `R2_BUCKET` | R2 bucket 名称 |
| `R2_PUBLIC_URL` | R2 公共访问 URL |
| `R2_ENDPOINT` | R2 S3 兼容 endpoint |
| `R2_ACCESS_KEY_ID` | R2 访问密钥 ID |
| `R2_SECRET_ACCESS_KEY` | R2 访问密钥 Secret |

## Beta 转 Stable

当 beta 版本测试通过后，转正流程：
1. 更新 `stable/manifest.json`，将组件的 URL 指向已有的 beta 构件
2. 无需重新构建或上传构件（共享池复用）
3. 可通过发布脚本 `--channel=stable` 配合已有版本号实现

## 注意事项

- Web tar.gz 打包使用 `-C out/ .`，避免解压后双层嵌套
- Server gzip 用 level 9 最大压缩
- 增量更新只检查版本是否不同，不做大小比较，beta→stable 不会自动回退
- electron-builder `signIgnore` 使用 **regex**（`\\.js$`），不是 glob
- `extraMetadata.main` 必须匹配架构（由 `scripts/dist.mjs` 动态处理）
