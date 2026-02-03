# UI Package npm 组件库打包设计

日期：2026-02-03

## 一、背景与目标
当前 `packages/ui` 仅作为工作区包被本地消费，`package.json` 仍指向 `src`，且 `private: true`，无法对外发布。目标是将其打包为可发布的组件库，产出 ESM + CJS + 类型声明，保持子路径导出（如 `@tenas-ai/ui/button`），并支持本地 `npm link` 使用。

## 二、范围与不做事项
范围内：
- 产物输出至 `dist/`，修改 `package.json` 指向构建产物
- 新增 tsup 构建配置与发布脚本
- 保持现有组件/导出结构不变

不做事项：
- 不改组件 API 与样式体系
- 不引入新的运行时依赖或改变依赖层级

## 三、打包方案（tsup，多入口输出）
采用 tsup 作为构建工具，配置多入口（覆盖 `src/**/*.ts(x)`），输出 ESM 与 CJS 双格式，同时生成 `.d.ts`。产物目录结构与 `src` 对齐，保证 subpath exports 可直接映射到 `dist`。

关键点：
- 输出目录：`dist/`
- 产物结构：`dist/<file>.js` + `dist/<file>.cjs` + `dist/<file>.d.ts`
- external：`peerDependencies` 中的 React/Next 等不打包
- sourcemap：开启便于调试

## 四、package.json 调整
- `private: true` → 移除
- `main/module/types` 改指向 `dist`
- `exports` 根路径与子路径改指向 `dist`
- 新增 `files: ["dist"]`
- 新增 `publishConfig.access: "public"`（若 scoped 包需要公开发布）
- 新增脚本：`build`, `clean`, `prepublishOnly`

## 五、本地 link 与发布流程
本地 link：
1) `pnpm --filter @tenas-ai/ui build`
2) 在 `packages/ui` 执行 `npm link` 或 `pnpm link --global`
3) 在消费方执行 `npm link @tenas-ai/ui`（或 `pnpm link --global @tenas-ai/ui`）

发布：
1) `pnpm --filter @tenas-ai/ui build`
2) 更新版本号
3) `npm publish --access public`

## 六、验证与回滚
- 验证 `dist` 产物齐全，`exports` 指向正确
- 在本地 consumer 中验证 `@tenas-ai/ui` 与 `@tenas-ai/ui/<component>` 可正常引入
- 发现问题可回滚 `package.json` 与 `tsup.config.ts` 变更
