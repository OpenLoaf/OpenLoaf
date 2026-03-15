# Server Knip 规则

本文档记录 `apps/server` 在使用 `knip` 时的专项判断规则。目标不是“把所有未使用导出都删掉”，而是先分辨哪些是规则、哪些是入口、哪些才是真死代码。

## 适用场景

适用于以下任务：

- 清理 `apps/server` 的 `unused exports`
- 为 `apps/server` 接入或调整 `knip`
- 解释为什么某个 server 导出看起来未使用，但不应直接删除
- 处理 `promptfoo`、测试脚本、YAML 入口造成的误报

## 核心结论

### 先补入口图，再看 `unused exports`

`apps/server` 的导出级分析只有在入口图接近真实执行路径时才有意义。至少应覆盖：

- `src/index.ts`
- `scripts/**/*.{ts,mjs}`
- 独立运行的测试文件
- 被 `promptfoo` 直接引用的 provider 文件

如果没有这些入口，`knip` 报出来的很多导出其实只是“未被扫描到”。

### `unused exports` 不等于“死代码”

对每个导出，先判断它属于哪一类：

1. 历史 barrel / re-export
2. 文件内 helper 误做了 `export`
3. 真正无调用方的旧实现
4. 规则、模板、注册表、配置边界、单一事实来源
5. 测试入口、脚本入口、YAML / 字符串路径入口

通常只有前 1-3 类适合直接清理。

### 规则类符号默认先保留

下列内容优先按“规则”处理，而不是按“死代码”处理：

- 模板注册表、能力组、错误消息映射
- 配置文件路径解析器、环境变量路径解析器
- 约定式目录结构、协议解析器、共享格式函数
- 前后端或测试之间的契约层导出

如果它们只是暂时没被静态图命中，优先调整分析方式，而不是删除。

## OpenLoaf 当前已验证的专项规则

### `promptfoo` provider 要显式纳入入口

像 `src/ai/__tests__/agent-behavior/openloaf-universal-provider.ts` 这种文件，虽然不是生产入口，但会被 `promptfoo` 的 `file://...` 配置真实执行。  
如果忽略它，相关 token store、SaaS auth client、SSE parser 等都容易被误报为未使用。

### 测试动态 import 会让引用关系丢失

像下面这种写法：

```ts
const mod = await import("../emailEnvStore");
```

对静态分析并不友好。若测试本身就是 `knip` 入口的一部分，优先改成静态 import，这样更利于稳定识别真实依赖关系。

### “删导出”优先于“删实现”

如果某个函数仍在本文件内部使用，但外部没人引用，优先把：

```ts
export function helper() {}
```

改成：

```ts
function helper() {}
```

而不是一上来删实现。

### 历史 barrel 可以优先清理

对于 `modules/*/index.ts` 这类仅做兼容 re-export、且生产代码已经直接引用更深路径的模块，可以优先删 barrel 或收口 re-export。

### 误报依赖可配置为 ignore

如果某个依赖只被测试框架、脚本工具或静态分析难以识别的链路使用，可以在确认真实用途后加入：

- `knip.json > workspaces.apps/server.ignoreDependencies`

这属于“修正规则”，不是“回避问题”。

## 推荐命令

### 读取上下文

```bash
sed -n '1,220p' knip.json
sed -n '1,220p' apps/server/package.json
rg -n "promptfoo|__tests__|file://" apps/server/src apps/server/scripts
```

### 扫描

```bash
pnpm --filter server analyze:unused
```

### 验证

```bash
pnpm --filter server check-types
pnpm --filter server analyze:unused
```

## 提交约束

如果用户要求提交：

1. 先确认工作区是否有其它并发改动
2. 只暂存 `apps/server` 与本次命令分析配置相关文件
3. 不要把其它 workspace 的实验性改动混入 server cleanup 提交

## 判定短句

可以直接删：

- 历史兼容 barrel
- 真正无调用方的旧函数
- 仅外部未使用的 helper export

先停下来核查：

- 注册表、模板、能力组、错误映射
- 配置路径、环境变量路径、规则源定义
- `promptfoo` provider、YAML 路径引用、动态 import 测试
- 只在脚本或测试入口使用的模块
