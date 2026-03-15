---
name: command-analysis-rules
description: 当用户要求“用命令分析代码”“分析 knip/tsc/build/lint/jscpd/madge/react hooks/react compiler/react-scan 输出”“清理死代码”“找重复代码”“排查循环依赖”“排查静态扫描误报”“扫描 web 或 server 的未使用代码/依赖/路由/构建问题”“分析 React Hook 告警并沉淀规则”“补充后台代码检测规则与回归流程”时使用。本技能适用于 OpenLoaf 项目内基于命令行结果做代码检测、误报甄别、规则沉淀与安全落地。
version: 1.3.0
---

# 命令分析规则库

把命令分析类任务定义为“验证命令结果并安全落地”，不要把扫描器输出直接当成真相。本技能负责提供统一工作流、判断矩阵与 OpenLoaf 项目特例；具体命令和专题细则放在 `references/` 中按需读取。

## 适用范围

适用于以下任务：

- 用命令分析未使用文件、未使用依赖、未使用导出、未列依赖
- 分析 `knip`、`tsc`、`build`、`lint`、`jscpd`、`madge`、React Hook、React Compiler、`react-scan` 输出
- 清理死代码、收敛重复代码、排查循环依赖、识别静态扫描误报
- 为 OpenLoaf 沉淀新的检测规则、入口补充方式、回归命令或误报处理策略

不适用于以下任务：

- 不需要执行命令的纯代码评审
- 纯业务重构且不涉及扫描结果判定
- 以数据库迁移、版本发布、安全审计为主的独立任务

## 工作方式

### 1. 先收敛任务边界

先确认四件事，再决定跑什么命令：

- 目标工作区：`apps/web`、`apps/server`、`packages/ui` 或跨工作区
- 目标问题：死代码、重复代码、循环依赖、Hook 告警、构建异常
- 分析粒度：文件、导出、依赖、目录、强连通分量、运行时热点
- 回归要求：类型检查、构建、最小测试、重扫同一命令

不要默认全仓库扫描，更不要先扫一大坨结果再人工挑拣。

### 2. 先读入口与配置

至少读取与当前任务直接相关的：

- `package.json`
- `tsconfig.json`
- `knip.json`
- 构建脚本、样式入口、运行脚本、复制脚本
- 会影响静态图的别名、barrel、动态 import、YAML / 字符串路径入口

先确认“扫描边界是否真实”，再解释扫描结果。

### 3. 把结果分桶，不直接动刀

默认把结果拆成四类：

- 真正可直接处理的问题
- 需要补入口或补规则后再判断的问题
- 可接受或应排除的噪音
- 高风险、需要额外验证或用户确认的问题

输出结论时也按这四类组织，不要只贴扫描器原始分类。

### 4. 先改规则，再改代码

当问题根因是扫描边界错误、入口缺失、忽略项缺失、路径别名未覆盖时，优先修分析规则；只有确认结果代表真实问题时，才删除代码、删除依赖或重构结构。

### 5. 每次落地都做回归

至少回归两类命令：

- 证明本轮修复生效的重扫命令
- 证明没有引入回归的类型检查 / 构建 / 最小测试

如果只改了局部文件，优先做最小回归，不要默认拉起全仓库高噪音脚本。

## 通用判断矩阵

### 把扫描器当线索，不当裁判

对 `Unused files`、`Unused dependencies`、`Unlisted dependencies`、`Unused exports`、`duplicates`、`circular` 分开判断，不要用一条规则处理所有输出。

### 先判断“规则 / 入口 / 边界”，再判断“死代码”

下列内容默认先按“规则源或入口边界”处理：

- ToolDef、事件工厂、注册表、模板、能力组
- 错误映射、配置解析、环境变量路径解析
- 约定式目录结构、协议格式函数、共享 parser
- 被测试、脚本、YAML、字符串路径、动态 import 触发的模块

这类内容若未被静态图命中，优先怀疑入口图不完整，而不是立刻删除。

### 死代码优先整块删，不优先零碎删

当整个目录已经脱离入口图时，优先整块清理；只有仍有局部复用时，才做单文件或单导出级删除。这样更容易避免残留样式、测试、JSON、helper 和类型定义。

### 重复代码按“行为边界”判断是否合并

优先合并：

- 纯解析器
- 纯类型 / contracts
- 常量映射 / schema 适配
- payload builder / normalize helper
- 无状态、无副作用、无平台绑定的共享逻辑

谨慎合并或保留：

- 交互节奏不同的 UI 代码
- 副作用边界不同的实现
- 为隔离平台依赖而保留的轻度重复
- 测试样板、平台入口、生成代码

### 循环依赖优先改依赖方向

优先采用以下顺序：

1. 下沉 `types`、`contracts`、`constants`、`schema`
2. 把“实现依赖实现”改成“实现依赖契约”
3. 避开 barrel，直接引用叶子文件
4. 拆开组合层与叶子层，避免反向引用

不要优先靠延迟 import、复制代码或保留兼容 barrel 碰运气。

### Hook 告警按三层治理

固定按以下顺序解释与修复：

1. 正确性：`rules-of-hooks`、`immutability`
2. 状态建模：`set-state-in-effect`、镜像 state、effect 回填
3. 性能与维护性：`exhaustive-deps`、`static-components`、运行时热点

优先改状态来源和边界，不要默认加 `eslint-disable`、机械补 `useMemo` / `useCallback`、或把真实依赖塞进 `ref`。

## OpenLoaf 项目特例

### `apps/web` 的 `knip` 默认只做死文件 / 死依赖判断

默认优先关注：

- `files`
- `dependencies`
- `unlisted`
- `duplicates`

不要默认大面积清 `exports` / `types`，因为噪音较高。

### Web Hook 分析默认覆盖 `packages/ui/src`

Web 侧会直接消费 UI 源码；因此 Hook 任务默认视为 `apps/web/src + packages/ui/src` 联合治理，而不是只看页面目录。

### `apps/server` 的导出级分析必须先补入口图

只有在真实入口接近完整时，`unused exports` 才有意义。至少核查：

- 运行时入口
- `scripts/**/*.{ts,mjs}`
- 独立运行的测试文件
- `promptfoo`、YAML、字符串路径、动态 import 触发的 provider / helper

### Hook 治理默认“错误先清、小文件先清、大文件后清”

先清会影响行为或阻塞优化的问题，再清收益高的小范围问题；把 Provider、Layout、输入容器这类高风险大文件放后面。

## 参考文档加载规则

按需读取，不要一次性全读：

- `references/knip-checklist.md`
  - 处理通用 `knip`、Web 死文件 / 死依赖、依赖误报与基础回归
- `references/server-knip-rules.md`
  - 处理 `apps/server` 的 `unused exports`、入口补齐与动态入口误报
- `references/jscpd-madge-checklist.md`
  - 处理重复代码、循环依赖、强连通分量与解环策略
- `references/react-hooks-checklist.md`
  - 处理 Hook 静态分析、React Compiler、运行时重渲染与验证顺序

新增专题时，把细则写入新的 `references/*.md`，不要继续把专项规则堆回 `SKILL.md`。

## 输出要求

完成任务后，至少交付以下内容：

- 本轮分析边界与使用的命令
- 哪些结果被判定为真实问题，哪些被判定为误报或噪音
- 实际采用的修复 / 忽略 / 补入口策略
- 回归命令与结果
- 这次是否沉淀出新的长期规则；若有，应优先补到对应 `references/`，再考虑是否更新本技能主体
