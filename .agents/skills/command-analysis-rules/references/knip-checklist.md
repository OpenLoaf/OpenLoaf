# Knip 检查清单

本文档是“命令分析规则库”中的一个专题参考，专门记录 `knip` 在 OpenLoaf 中的使用方式、常见误报与验证步骤。后续如增加 server/backend 检测规则，应新增独立参考文件，不要把所有规则都堆到本文件中。

## 常用命令

### 基础扫描

```bash
pnpm exec knip --workspace apps/web
pnpm exec knip --workspace apps/server
```

### JSON 输出

```bash
pnpm exec knip --workspace apps/web --reporter json > /tmp/openloaf-web-knip.json
```

### 读取关键配置

```bash
sed -n '1,220p' knip.json
sed -n '1,220p' apps/web/package.json
sed -n '1,220p' apps/web/tsconfig.json
sed -n '1,120p' apps/web/src/index.css
sed -n '1,220p' apps/web/next.config.js
sed -n '1,220p' scripts/copy-syncfusion-assets.mjs
```

### 验证依赖是否真实存在

```bash
cd apps/web && node -e "console.log(require.resolve('@syncfusion/ej2-base/styles/material3.css'))"
cd apps/web && node -e "console.log(require.resolve('tw-animate-css/package.json'))"
```

### 最终验收

```bash
pnpm exec knip --workspace apps/web
pnpm --filter web check-types
pnpm --filter web build
```

## OpenLoaf 中已知高频误报

### `tw-animate-css`

- 来源：`apps/web/src/index.css`
- 使用方式：`@import "tw-animate-css";`
- 处理：保留依赖，并加入 `knip.json` 的 `apps/web.ignoreDependencies`

### Syncfusion 依赖

- 包：
  - `@syncfusion/ej2-base`
  - `@syncfusion/ej2-react-documenteditor`
  - `@syncfusion/ej2-react-pdfviewer`
  - `@syncfusion/ej2-react-spreadsheet`
- 来源：
  - `apps/web/src/styles/syncfusion.css`
  - `apps/web/next.config.js`
  - `scripts/copy-syncfusion-assets.mjs`
- 处理：保留依赖，并加入 `knip.json` 的 `apps/web.ignoreDependencies`

### `packages/ui/src` 的隐式依赖

- 原因：`apps/web/tsconfig.json` 使用 `paths` 直连 `packages/ui/src`
- 现象：`web` 类型检查报 `packages/ui/src` 缺包
- 处理：把缺失依赖补到 `packages/ui/package.json`，不要只补到 `apps/web`

## 删除前核查清单

- 是否为 Next.js 入口文件
- 是否存在动态 import 或字符串注册
- 是否仅在测试中使用
- 是否通过 CSS `@import` 使用
- 是否通过构建脚本、复制脚本、`next.config.js` 使用
- 是否属于 workspace alias 间接引用
- 是否是用户当前正在修改的文件

## 提交流程

如果用户要求提交：

1. 先看 `git status --short`
2. 只暂存当前清理任务相关文件
3. 避免把其它 workspace 的并发改动一起提交
4. 提交信息使用 Conventional Commits，例如：

```bash
git commit -m "refactor(web): clean unused web code and deps"
```
