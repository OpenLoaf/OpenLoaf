# jscpd / madge 检查清单

本文档是“命令分析规则库”的专题参考，专门记录重复代码与循环依赖扫描的执行方式、分类方法与回归验证顺序。目标是沉淀**规则**，不是固化某一次任务里的目录名或修复代码。

## 适用场景

- 使用 `jscpd` 扫描重复代码
- 使用 `madge` 扫描循环依赖
- 判断哪些重复值得合并，哪些应保留
- 规划“如何解环”而不是只列出环

## 推荐命令

### 重复代码扫描

```bash
pnpm exec jscpd \
  --gitignore \
  --reporters console \
  --pattern "**/*.{ts,tsx,js,jsx}" \
  --ignore "<ignore-glob-1>,<ignore-glob-2>" \
  <path...>
```

### 循环依赖扫描

```bash
pnpm exec madge \
  --circular \
  --extensions ts,tsx \
  --ts-config <tsconfig-path> \
  <entry-dir>
```

如果需要后处理或比较前后结果，再补 JSON 或文本落盘。

## 扫描前边界规则

### `jscpd`

先定义扫描边界，再运行：

- 是否遵守 `.gitignore`
- 只扫哪些工作区
- 只扫哪些文件类型
- 排除哪些目录类别

默认优先排除以下类别：

- 构建输出
- 缓存目录
- 生成代码
- 测试、快照、fixtures
- 第三方拷贝代码
- 用户明确声明“重复可接受”的目录类别

### `madge`

先确认：

- 扫描入口目录
- 使用的 `tsconfig`
- 是否需要按工作区分别扫描
- 是否存在 barrel、路径别名或生成入口影响图谱

不要把全仓库一次性扫描当默认方案，先按工作区收敛。

## `jscpd` 结果分类规则

### A. 应直接排除的噪音

- 生成代码
- 构建产物
- 测试样板
- 文档示例
- 用户明确允许重复的目录类别

### B. 可接受重复

- 基础 UI 组件或设计系统壳层
- 平台入口代码
- 相似但副作用不同的实现
- 为了隔离依赖边界保留的轻度重复

### C. 优先合并的重复

- 纯解析器
- 纯类型定义
- 纯 contracts / interfaces
- 常量映射与 schema 适配
- payload builder / normalize helper
- 无状态、无副作用、无平台绑定的共享逻辑

## 判断“能不能合并”的规则

只有同时满足以下条件，才优先合并：

1. 业务语义一致
2. 依赖边界一致
3. 生命周期一致
4. 副作用一致
5. 合并后不会把底层重新依赖回上层

如果只是文本相似，但调用时机、状态来源或依赖方向不同，应优先保留分离。

## `madge` 结果分类规则

### 先识别根因，不按路径数计数

一个强连通分量往往会展开成多条路径。分析时先合并同源路径，再判断真正的环数量。

### 常见循环类型

- 类型/常量环
- barrel re-export 环
- 组合层反向引用叶子 hooks/组件
- 工具层/服务层直接依赖核心实现
- 运行时副作用环

## 推荐解环顺序

### 1. 先抽纯叶子文件

优先抽：

- `types`
- `contracts`
- `constants`
- `schema`

这些文件不应依赖页面、组件、服务实现。

### 2. 把“实现依赖实现”改成“实现依赖契约”

当底层工具、hooks、服务只需要上层的一部分能力时，抽接口或 host contract，而不是直接 import 整个核心实现类。

### 3. 避开 barrel

如果环是由 `index.ts` / `index.tsx` 反带出来的，优先改成直接引用真实叶子文件。

### 4. 把组合层从叶子层剥开

如果页面组合层既聚合子模块、又向下提供类型，容易形成反向引用。应把共享类型单独下沉，组合层只负责拼装。

## 回归验证顺序

建议按以下顺序验证：

1. 类型检查
2. 循环依赖重扫
3. 重复代码重扫
4. 必要时补运行时验证

示例顺序：

```bash
pnpm --filter <workspace> exec tsc --noEmit -p tsconfig.json
pnpm exec madge --circular --extensions ts,tsx --ts-config <tsconfig-path> <entry-dir>
pnpm exec jscpd --gitignore --reporters console --pattern "**/*.{ts,tsx}" --ignore "<ignore-globs>" <path...>
```

## 输出建议

输出结论时，至少拆成四类：

- 已排除的噪音
- 可接受重复
- 建议合并的重复
- 真实循环依赖及其根因

如果已经实施修复，再补：

- 采用的解法类型
- 回归命令
- 剩余未处理项
