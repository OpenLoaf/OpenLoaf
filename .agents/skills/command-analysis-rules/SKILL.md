---
name: command-analysis-rules
description: 当用户要求“用命令分析代码”“分析 knip/tsc/build/lint/jscpd/madge 输出”“清理死代码”“找重复代码”“排查循环依赖”“排查静态扫描误报”“补充后台代码检测规则”“扫描 web 或 server 的未使用代码/依赖/路由/构建问题”时使用。本技能适用于 OpenLoaf 项目内基于命令行结果做代码检测、误报甄别、规则沉淀与回归验证。
version: 1.1.0
---

# 命令分析规则库

在 OpenLoaf 中执行命令分析类任务时，先把任务定义为“验证命令结果并安全落地”，不要把扫描器输出直接等同于真相。把本技能视为一个可持续扩展的规则库：上层提供统一的分析方法，下层通过 `references/` 持续补充不同命令、不同工作区、不同问题类型的专项规则。

## 适用范围

适用于以下任务：

- 使用 `knip` 扫描 `apps/web`、`apps/server` 或其他工作区
- 使用 `jscpd` 扫描重复代码，并判断哪些重复值得合并
- 使用 `madge` 扫描循环依赖，并规划解环策略
- 使用 `tsc`、`build`、`lint`、脚本输出来定位实际依赖关系
- 根据命令输出清理未使用文件、依赖、导出
- 分析“构建通过但扫描报未使用”或“扫描清理后运行报缺包”的情况
- 沉淀新的后台代码检测规则、命令分析经验或误报处理规则
- 在 monorepo 中用命令行收敛可安全删除的范围

不适用于以下任务：

- 纯代码评审但不需要执行扫描命令
- 只做业务逻辑重构，不涉及未使用代码判断
- 需要数据库迁移、版本发布或安全审计的独立任务

## 核心原则

### 先收敛范围，再删代码

优先读取目标工作区的 `package.json`、`knip.json`、`tsconfig.json`、构建脚本、样式入口和构建配置，确认扫描边界。不要一上来按全仓库结果批量删除。

### 把扫描器当线索，不当裁判

对 `Unused files`、`Unused dependencies`、`Unlisted dependencies` 分开处理。对 `exports`、`types`、`duplicates` 类结果默认更谨慎，除非用户明确要求深挖导出级清理。

### 先判断“这是规则”还是“这是死代码”

对 `unused exports`，不要直接把扫描结果等同于“应该删除”。先分类：

- 历史兼容 re-export / barrel
- 仅文件内使用但误做了 `export` 的 helper
- 只被测试、脚本、YAML、字符串路径或动态入口使用的符号
- 规则、模板、注册表、错误映射、配置边界、单一事实来源

通常前两类更适合清理；后两类默认不是“死代码”。

### 规则类导出优先保守处理

在 OpenLoaf 中，下列内容经常承担“规则”职责，而不只是普通实现：

- ToolDef、事件工厂、能力组、模板注册表
- 错误消息映射、配置路径解析、环境变量路径解析
- 约定式目录结构、共享解析器、协议格式函数
- 被测试框架、YAML、脚本或文件路径直接引用的入口模块

如果某个导出属于规则源或约定边界，即使暂时没有被静态图命中，也应优先验证入口图是否完整，而不是直接删除。

### 先定义扫描边界，再看重复与循环

对 `jscpd`、`madge` 这类结构扫描，先确认：

- 目标工作区
- 文件类型
- 是否需要遵守 `.gitignore`
- 是否应排除生成产物、缓存目录、构建输出、测试目录、快照目录
- 是否存在“允许重复”的目录类别，例如基础组件、设计系统、平台壳层

不要先跑全仓库再在结果里人工挑拣，这样容易把噪音当结论。

### 优先删除“整块已脱离入口图”的目录

当一整个功能目录已经不在入口图中时，优先整块删除，而不是只删单个文件。这样能减少残留样式、测试、JSON、工具函数和类型定义。

### 重复代码要区分“应合并”和“可接受重复”

扫描出重复代码后，先分类，不要默认“一重复就抽象”：

- **优先合并**：纯解析器、纯类型定义、纯常量映射、payload builder、路径/参数归一化、无 UI 生命周期的共享逻辑
- **谨慎合并**：相似但存在不同交互节奏、不同副作用边界、不同平台依赖的实现
- **通常可接受**：基础组件、设计系统壳层、测试样板、生成代码、平台入口文件、用户明确允许重复的目录

判断标准应基于“行为边界是否一致”，而不是只看文本相似度。

### 循环依赖优先改依赖方向，不靠规避技巧

解循环依赖时，优先从依赖方向入手，而不是靠延迟 import、复制代码或保留 barrel 碰运气。默认按以下顺序思考：

1. 抽纯类型、纯常量、纯 contracts 到叶子模块
2. 把“实现依赖实现”改成“实现依赖接口/契约”
3. 避开 barrel re-export，直接引用真实叶子文件
4. 把组合层与叶子 hooks/组件拆开，避免底层反向引用页面组合层

如果一个环只是因为类型反向引用形成，应优先做类型下沉；如果一个环是工具层/服务层直接绑死核心实现，应优先抽接口。

### 删除依赖时必须考虑脚本和样式链路

`knip` 可能识别不到以下依赖使用方式：

- CSS 中的 `@import`
- `next.config.js`、构建脚本、资源复制脚本中的隐式依赖
- 运行时动态 import
- workspace 路径别名指向的源码依赖

删除前必须验证这些链路。

### 用包管理器修改依赖，不手改锁文件

依赖收缩或回补时，优先使用：

```bash
pnpm --filter web remove <pkg>
pnpm --filter web add <pkg>
pnpm --filter @openloaf/ui add <pkg>
```

这样可以同步更新 `package.json` 与 `pnpm-lock.yaml`。

## OpenLoaf 项目专用规则

### 规则按“通用方法 + 专项参考”组织

把 `SKILL.md` 保持为顶层方法论，不把所有具体规则都堆在这里。遇到新专题时，在 `references/` 下新增对应文档，例如：

- `references/knip-checklist.md`
- `references/jscpd-madge-checklist.md`
- `references/server-route-checklist.md`
- `references/build-regression-checklist.md`
- `references/dependency-resolution-checklist.md`

在实际任务中，只读取当前需要的参考文件。

### `apps/web` 当前默认只把 `knip` 当死文件/死依赖探测器

对 `apps/web`，优先只关注：

- `files`
- `dependencies`
- `unlisted`
- `duplicates`

不要默认按 `exports`、`types` 大面积清理，因为该项目中存在大量组件内部类型导出与具名导出，这类结果噪音很高，容易误删。

### `apps/server` 可以做导出级清理，但前提是入口图完整

对 `apps/server`，可以分析：

- `files`
- `exports`
- `dependencies`
- `unlisted`
- `duplicates`

但前提是 `knip` 的 `entry` 已覆盖真实入口，而不只是 `src/index.ts`。至少要核查：

- 运行时入口
- `scripts/**/*.{ts,mjs}`
- 独立运行的测试文件
- 被 `promptfoo`、YAML、脚本或字符串路径引用的 provider / helper

如果入口图不完整，`unused exports` 很容易是在报“没扫到入口”，不是在报“真死代码”。

### `apps/server` 的 `unused exports` 先按四类处理

对 server 的导出结果，优先按以下顺序处理：

1. 历史 barrel / re-export
2. 只在当前文件内使用的 helper export
3. 真正没有调用方的旧函数
4. 规则、注册表、模板、测试入口、动态约定导出

通常只应直接清理前 1-3 类；第 4 类先补入口或改分析规则，再决定是否保留。

### 重复代码扫描默认遵守 `.gitignore`

运行 `jscpd` 时，默认开启 `.gitignore` 过滤，并优先排除以下类别，而不是写死某个具体目录名：

- 构建输出目录
- 缓存目录
- 生成代码目录
- 测试与快照目录
- 用户明确声明“重复可接受”的目录类别

如果用户指定某类目录中的重复“不需要管”，应把它实现为扫描边界规则，而不是扫描后再逐条人工忽略。

### 循环依赖扫描先看强连通分量，不看路径数量

`madge` 往往会把同一个根因展示成多条路径。分析时应先识别“是不是同一个强连通分量反复展开”，不要按输出条数误判问题规模。

对每个循环，优先确认它属于哪一类：

- 类型/常量环
- barrel re-export 环
- 页面组合层与 hooks/组件的反向环
- 工具层/服务层对核心实现的反向环
- 运行时副作用环

不同类别使用不同解法，不要一刀切。

### `apps/web` 的类型检查会连带检查 `packages/ui/src`

`apps/web/tsconfig.json` 通过 `paths` 把 `@openloaf/ui` 指向 `../../packages/ui/src`。因此：

- `web` 类型检查失败，不一定是 `apps/web` 自己的问题
- `packages/ui/src` 中真实使用但 `packages/ui/package.json` 未声明的依赖，需要补到 `packages/ui`

### 识别当前已知的 `knip` 误报

下列依赖在 OpenLoaf 中容易被误判为未使用，但实际不能直接删除：

- `tw-animate-css`
  原因：通过 `apps/web/src/index.css` 中的 `@import "tw-animate-css"` 使用
- `@syncfusion/ej2-base`
- `@syncfusion/ej2-react-documenteditor`
- `@syncfusion/ej2-react-pdfviewer`
- `@syncfusion/ej2-react-spreadsheet`
  原因：被 `apps/web/src/styles/syncfusion.css`、`apps/web/next.config.js` 与 `scripts/copy-syncfusion-assets.mjs` 间接使用

对于这类依赖，要么保留，要么在 `knip.json` 的 `ignoreDependencies` 中显式忽略。

### `apps/server` 的专项规则应写入独立参考

涉及以下主题时，优先再读取专项参考，而不是只看本文件：

- `apps/server` 的 `unused exports` 清理
- 测试入口补图
- `promptfoo` / YAML 文件入口识别
- “规则导出”与“死代码导出”的判定

当前专项参考：

- `references/server-knip-rules.md`

### 构建脚本依赖必须单独核查

删除依赖前，必须检查：

- `apps/web/src/index.css`
- `apps/web/src/styles/*.css`
- `apps/web/next.config.js`
- `apps/web/package.json` 中的 `prebuild`、`postinstall`、`build`
- 仓库根目录 `scripts/*.mjs`

### 工作区有脏变更时，避免误带其它改动

若用户同时在改 `server`、`desktop` 或 `board`：

- 不要回滚无关改动
- 删除前先看 `git status --short`
- 提交时使用精确暂存，只提交当前扫描任务涉及的文件

## 推荐流程

### 1. 读取上下文

优先读取：

- `knip.json`
- 目标工作区 `package.json`
- 目标工作区 `tsconfig.json`
- 样式入口与构建脚本

### 2. 运行扫描

对 `apps/web` 推荐先运行：

```bash
pnpm exec knip --workspace apps/web
```

对 `apps/server` 推荐先运行：

```bash
pnpm --filter server analyze:unused
```

需要后处理时，使用 JSON：

```bash
pnpm exec knip --workspace apps/web --reporter json
```

对重复代码与循环依赖，优先参考：

- `references/jscpd-madge-checklist.md`

### 3. 分类结果

按以下顺序处理：

1. `Unused files`
2. `Unused dependencies`
3. `Unlisted dependencies`
4. `duplicates`

如果文件级结果已经明显成立，先删文件，再重新扫描；不要一开始就根据旧结果删依赖。

若结果中包含 `Unused exports`，再追加一层分类：

1. 规则导出
2. 测试入口导出
3. 历史兼容导出
4. 文件内私有 helper
5. 真正无调用方的遗留函数

对 `jscpd` 与 `madge`，在分类时增加两步：

1. 先识别哪些结果属于“允许存在”或“应排除噪音”
2. 再在剩余结果中判断哪些适合合并、哪些适合解耦

### 4. 删除文件

优先删除：

- 历史备份文件，如 `*.bak`
- 明确脱离入口图的旧页面、旧组件、旧目录
- 整块废弃功能目录

删除前避开用户正在改的文件。

### 5. 收缩依赖

在文件删除完成后，再处理依赖。优先依据“当前源码 + 样式 + 构建脚本”判断依赖是否仍需保留。

### 6. 回补缺失依赖

如果 `knip` 报 `Unlisted dependencies`，优先把包加回真实使用它的 workspace，而不是依赖根目录 hoist“碰巧可用”。

### 7. 重新验证

至少执行：

```bash
pnpm exec knip --workspace apps/web
pnpm --filter web check-types
pnpm --filter web build
```

对 `apps/server`，至少执行：

```bash
pnpm --filter server check-types
pnpm --filter server analyze:unused
```

如果 dev 模式曾报模块解析错误，再补一个运行态判断：

- 用 `require.resolve(...)` 检查模块解析
- 重启 `next dev`

## 决策规则

### 何时可以直接删

- 文件出现在 `Unused files` 中
- 全仓库没有真实引用
- 不属于 Next.js 约定入口、动态 import、运行时注册表
- 不属于样式/脚本/资源复制链路

### 何时必须停下来核查

- 依赖只在 CSS、脚本或构建配置中出现
- 依赖通过 workspace alias 间接被引用
- 构建通过但 dev 报缺包
- 扫描结果涉及 `packages/ui/src` 这类跨 workspace 源码映射
- 导出可能是规则、模板、注册表、错误映射、路径约定或测试入口
- 导出只被 `promptfoo`、YAML、动态 import、脚本字符串路径引用
- 重复代码位于基础组件、设计系统或平台壳层
- 循环依赖涉及 barrel、类型导出或组合层反向引用

### 何时应保留重复

- 重复只是结构相似，但依赖边界、生命周期或副作用不同
- 重复位于用户明确声明“可接受重复”的目录类别
- 合并后会把底层模块重新绑回上层实现，反而制造新耦合

### 何时应优先合并重复

- 逻辑是纯函数、纯类型、纯 contracts、纯常量
- 两处重复的业务语义一致，而不是仅仅写法相似
- 合并后能顺手削减循环依赖或减少双向引用

### 何时应优先解循环而不是共用实现

- 两端当前的共同点只有类型，不是行为
- 共享实现会引入新的运行时依赖
- 问题根因其实是 barrel、组合层反向引用或核心实现暴露过多

### 何时应调整 `knip` 配置

- 同一类误报重复出现
- 某些依赖长期只会通过 CSS/脚本使用
- 当前任务只关心死文件/死依赖，不想被导出级噪音淹没

## 输出要求

完成任务后，输出中应明确说明：

- 删除了哪些类别的死代码
- 哪些依赖是误报并被保留
- 哪些重复代码被判定为“可合并”，哪些被判定为“可接受重复”
- 哪些循环依赖是真问题，根因属于哪一类，采用了什么解法
- 执行了哪些验证命令
- 是否还有未提交的其它工作区改动

## 扩展方式

当任务中出现新的命令分析经验时，按以下方式扩展：

1. 先判断规则是“全局方法”还是“专题细则”
2. 全局方法写回 `SKILL.md`
3. 专题细则写入 `references/` 新文件
4. 如果专题依赖特定目录、脚本或工具，明确写出适用范围
5. 如果某条规则已被证明是项目长期约束，把它提升到 `SKILL.md`

## 参考资料

当前已沉淀的专题参考：

- `references/knip-checklist.md`
- `references/jscpd-madge-checklist.md`
- `references/server-knip-rules.md`
