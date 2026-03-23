# AI 面板统一插槽系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一所有 AI 面板的插槽系统，让所有父节点都显示在面板中，清晰区分功能插槽和关联节点，支持点击交换和持久化。

**Architecture:** 在现有 InputSlotBar 框架基础上扩展：新增 `PersistedSlotMap` 类型支持分配持久化，新增 `restoreOrAssign` 函数整合缓存恢复 + 自动分配，重构 InputSlotBar 为双区布局（Active Slots + Associated Refs），各面板传递完整 rawUpstream + slotAssignment 持久化。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, i18n (react-i18next)

**Spec:** `docs/superpowers/specs/2026-03-23-panel-slot-unified-upstream-design.md`

---

### Task 1: 类型定义扩展

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/slot-types.ts`
- Modify: `apps/web/src/components/board/panels/variants/types.ts`
- Modify: `apps/web/src/components/board/board-contracts.ts`
- Test: `apps/web/src/components/board/panels/variants/__tests__/variant-schema.vitest.ts`

- [ ] **Step 1: 在 slot-types.ts 新增 PersistedSlotMap 类型**

在 `SlotAssignment` 类型之后（约第 59 行后）新增：

```typescript
/**
 * 持久化的插槽分配映射（存入 paramsCache，跨会话恢复）
 * 与运行时的 SlotAssignment 区分：本类型仅记录 slotId → 来源标识
 */
export type PersistedSlotMap = Record<string, string>
// key: slotId (如 'image', 'mask', 'startFrame')
// value: nodeId（来自父节点）| "manual:<board-relative-path>"（用户手动上传）
```

同时将 `OverflowStrategy` 类型添加 JSDoc deprecated 标记：

```typescript
/** @deprecated 新架构下溢出节点统一进入关联节点区，不再需要插槽级溢出策略 */
export type OverflowStrategy = 'rotate' | 'merge' | 'truncate'
```

- [ ] **Step 2: 在 types.ts 的 VariantParamsSnapshot 新增 slotAssignment 字段**

在 `apps/web/src/components/board/panels/variants/types.ts` 中，`VariantParamsSnapshot` 接口新增：

```typescript
export interface VariantParamsSnapshot {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
  slotAssignment?: PersistedSlotMap  // 新增
}
```

需要在文件顶部添加 import：

```typescript
import type { PersistedSlotMap } from './slot-types'
```

- [ ] **Step 3: 在 types.ts 的 VariantFormProps 新增 resolvedSlots prop**

```typescript
export interface VariantFormProps {
  variant: V3Variant
  upstream: VariantUpstream
  nodeResourceUrl?: string
  nodeResourcePath?: string
  disabled?: boolean
  initialParams?: VariantParamsSnapshot
  onParamsChange: (params: VariantParamsSnapshot) => void
  onWarningChange?: (warning: string | null) => void
  resolvedSlots?: Record<string, MediaReference[]>  // 新增：框架层分配结果
}
```

需要 import `MediaReference`：

```typescript
import type { MediaReference, PersistedSlotMap } from './slot-types'
```

- [ ] **Step 3b: 更新 board-contracts.ts 的 paramsCache 类型**

`board-contracts.ts` 中 `AiGenerateConfig.paramsCache` 使用内联类型，缺少 `slotAssignment` 字段。将其替换为引用 `VariantParamsSnapshot`：

```typescript
import type { VariantParamsSnapshot } from './panels/variants/types'

export type AiGenerateConfig = {
  // ... 其他字段不变
  paramsCache?: Record<string, VariantParamsSnapshot>  // 替换原内联类型
  // ...
}
```

- [ ] **Step 3c: 扩展 ResolvedSlotInputs 类型**

在 `InputSlotBar.tsx`（或单独的类型文件）中，`ResolvedSlotInputs` 需要包含媒体引用以便传递给 variant：

```typescript
export type ResolvedSlotInputs = {
  inputs: Record<string, unknown>        // API 就绪的输入
  mediaRefs: Record<string, MediaReference[]>  // 新增：按 slotId 的媒体引用（用于 resolvedSlots prop）
  isValid: boolean
}
```

- [ ] **Step 4: 更新现有测试确认类型兼容**

在 `apps/web/src/components/board/panels/variants/__tests__/variant-schema.vitest.ts` 中添加类型测试：

```typescript
import type { PersistedSlotMap } from '../slot-types'
import type { VariantParamsSnapshot } from '../types'

describe('PersistedSlotMap type', () => {
  it('should be assignable with node IDs and manual refs', () => {
    const map: PersistedSlotMap = {
      image: 'node-id-123',
      mask: 'manual:assets/uploads/mask.png',
    }
    expect(map.image).toBe('node-id-123')
    expect(map.mask).toStartWith('manual:')
  })

  it('should be storable in VariantParamsSnapshot', () => {
    const snapshot: VariantParamsSnapshot = {
      inputs: { image: { path: 'asset/img.jpg' } },
      params: { strength: 0.8 },
      slotAssignment: { image: 'node-123' },
    }
    expect(snapshot.slotAssignment).toBeDefined()
  })
})
```

- [ ] **Step 5: 运行测试验证**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm vitest run apps/web/src/components/board/panels/variants/__tests__/variant-schema.vitest.ts`

- [ ] **Step 6: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/board/panels/variants/slot-types.ts apps/web/src/components/board/panels/variants/types.ts apps/web/src/components/board/panels/variants/__tests__/variant-schema.vitest.ts
git commit -m "feat(board): add PersistedSlotMap type and slotAssignment to VariantParamsSnapshot"
```

---

### Task 2: 分配引擎扩展 — restoreOrAssign

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/slot-engine.ts`
- Test: `apps/web/src/components/board/panels/variants/__tests__/slot-restore.vitest.ts` (Create)

- [ ] **Step 1: 编写 restoreOrAssign 的测试**

创建 `apps/web/src/components/board/panels/variants/__tests__/slot-restore.vitest.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import type { UpstreamData } from '../../../engine/upstream-data'
import type { InputSlotDefinition, PersistedSlotMap, ReferencePools, MediaReference } from '../slot-types'
import { buildReferencePools, restoreOrAssign } from '../slot-engine'

// 辅助：创建最小 UpstreamData
function makeUpstream(entries: Array<{ nodeId: string; nodeType: string; data: string }>): UpstreamData {
  return {
    textList: entries.filter(e => e.nodeType === 'text').map(e => e.data),
    imageList: entries.filter(e => e.nodeType === 'image').map(e => e.data),
    videoList: entries.filter(e => e.nodeType === 'video').map(e => e.data),
    audioList: entries.filter(e => e.nodeType === 'audio').map(e => e.data),
    entries,
  }
}

const imageSlot: InputSlotDefinition = {
  id: 'image',
  mediaType: 'image',
  labelKey: 'slot.image',
  min: 1,
  max: 1,
  allowManualInput: true,
  overflowStrategy: 'rotate',
}

const maskSlot: InputSlotDefinition = {
  id: 'mask',
  mediaType: 'image',
  labelKey: 'slot.mask',
  min: 0,
  max: 1,
  allowManualInput: true,
  overflowStrategy: 'rotate',
}

describe('restoreOrAssign', () => {
  it('should auto-assign when no cached assignment', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
      { nodeId: 'img-2', nodeType: 'image', data: 'asset/b.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const result = restoreOrAssign([imageSlot, maskSlot], pools, undefined)

    expect(result.assigned.image).toHaveLength(1)
    expect(result.assigned.mask).toHaveLength(1)
    expect(result.associated).toHaveLength(0)
  })

  it('should restore cached assignment when nodeIds still connected', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
      { nodeId: 'img-2', nodeType: 'image', data: 'asset/b.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const cached: PersistedSlotMap = { image: 'img-2', mask: 'img-1' }
    const result = restoreOrAssign([imageSlot, maskSlot], pools, cached)

    // img-2 应该在 image 插槽，img-1 在 mask 插槽（按缓存恢复）
    expect((result.assigned.image[0] as MediaReference).nodeId).toBe('img-2')
    expect((result.assigned.mask[0] as MediaReference).nodeId).toBe('img-1')
  })

  it('should fallback to auto-assign for disconnected cached nodeIds', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    // img-2 已断开连接
    const cached: PersistedSlotMap = { image: 'img-2', mask: 'img-1' }
    const result = restoreOrAssign([imageSlot, maskSlot], pools, cached)

    // image 插槽缓存失效 → 自动分配 img-1
    expect((result.assigned.image[0] as MediaReference).nodeId).toBe('img-1')
    // mask 插槽缓存的 img-1 已被 image 用掉 → 空
    expect(result.assigned.mask).toHaveLength(0)
  })

  it('should put unassigned upstream nodes into associated', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
      { nodeId: 'img-2', nodeType: 'image', data: 'asset/b.jpg' },
      { nodeId: 'img-3', nodeType: 'image', data: 'asset/c.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const result = restoreOrAssign([imageSlot], pools, undefined)

    expect(result.assigned.image).toHaveLength(1)
    expect(result.associated).toHaveLength(2)
  })

  it('should handle manual refs in cache', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const cached: PersistedSlotMap = { image: 'manual:assets/uploads/custom.jpg' }
    const result = restoreOrAssign([imageSlot], pools, cached)

    // manual ref 保留在 image 插槽
    expect(result.assigned.image).toHaveLength(1)
    // img-1 未被分配 → 进入 associated
    expect(result.associated).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm vitest run apps/web/src/components/board/panels/variants/__tests__/slot-restore.vitest.ts`
Expected: FAIL — `restoreOrAssign` 不存在

- [ ] **Step 3: 实现 restoreOrAssign 函数**

在 `apps/web/src/components/board/panels/variants/slot-engine.ts` 中，在 `assignUpstreamToSlots` 函数之后新增：

```typescript
import type { PersistedSlotMap } from './slot-types'

export type UnifiedSlotResult = {
  /** 功能插槽分配：slotId → 引用列表 */
  assigned: Record<string, PoolReference[]>
  /** 未分配到任何功能插槽的媒体父节点 */
  associated: MediaReference[]
  /** 必填但为空的插槽 ID */
  missingRequired: string[]
}

/**
 * 整合缓存恢复 + 自动分配的统一入口
 *
 * 1. 若提供 cachedAssignment，尝试从缓存恢复（校验 nodeId 仍连接）
 * 2. 缓存中引用了已断开节点的插槽 → 回退自动分配
 * 3. 无缓存的插槽 → 自动分配
 * 4. 所有未分配到功能插槽的媒体节点 → associated
 */
export function restoreOrAssign(
  slots: InputSlotDefinition[],
  pools: ReferencePools,
  cachedAssignment: PersistedSlotMap | undefined,
): UnifiedSlotResult {
  const assigned: Record<string, PoolReference[]> = {}
  const usedNodeIds = new Set<string>()

  // 构建 nodeId → MediaReference 的快速查找表
  const mediaRefMap = new Map<string, MediaReference>()
  for (const type of ['image', 'video', 'audio'] as const) {
    for (const ref of pools[type] ?? []) {
      if (isMediaReference(ref)) {
        mediaRefMap.set(ref.nodeId, ref)
      }
    }
  }

  // Pass 1: 尝试从缓存恢复
  if (cachedAssignment) {
    for (const slot of slots) {
      const cachedValue = cachedAssignment[slot.id]
      if (!cachedValue) continue

      if (cachedValue.startsWith('manual:')) {
        // 手动上传：构造合成 MediaReference
        const manualPath = cachedValue.slice('manual:'.length)
        assigned[slot.id] = [{
          nodeId: `__manual_${slot.id}__`,
          nodeType: slot.mediaType,
          url: manualPath,
          path: manualPath,
        } as MediaReference]
        continue
      }

      // 节点引用：检查是否仍连接
      const ref = mediaRefMap.get(cachedValue)
      if (ref && !usedNodeIds.has(cachedValue)) {
        assigned[slot.id] = [ref]
        usedNodeIds.add(cachedValue)
      }
      // 否则留空，Pass 2 会处理
    }
  }

  // Pass 2: 未分配的插槽执行自动分配
  for (const slot of slots) {
    if (assigned[slot.id]?.length) continue
    assigned[slot.id] = []

    if (slot.mediaType === 'text') {
      // 文本插槽：从文本池分配
      const textRefs = (pools.text ?? []).filter(isTextReference)
      if (textRefs.length > 0) {
        assigned[slot.id] = textRefs.slice(0, slot.max)
      }
      continue
    }

    // 媒体插槽：按类型匹配
    const pool = (pools[slot.mediaType] ?? []).filter(isMediaReference)
    const available = pool.filter(r => !usedNodeIds.has(r.nodeId))
    const toAssign = available.slice(0, slot.max)
    assigned[slot.id] = toAssign
    for (const ref of toAssign) {
      usedNodeIds.add(ref.nodeId)
    }
  }

  // Pass 2.5: 合并策略 — 缓存恢复后，如果有空插槽且有新的匹配上游节点
  // （不在缓存中但已连接），允许自动填入。这确保新增连线时空插槽能被填充。
  // 上面 Pass 2 已经覆盖了这个逻辑（未分配的插槽执行自动分配）。

  // Pass 3: 收集关联节点（未分配的媒体引用）
  const associated: MediaReference[] = []
  for (const type of ['image', 'video', 'audio'] as const) {
    for (const ref of pools[type] ?? []) {
      if (isMediaReference(ref) && !usedNodeIds.has(ref.nodeId)) {
        associated.push(ref)
      }
    }
  }

  // Pass 4: 收集 missingRequired
  const missingRequired: string[] = []
  for (const slot of slots) {
    if (slot.min > 0 && (!assigned[slot.id] || assigned[slot.id].length < slot.min)) {
      missingRequired.push(slot.id)
    }
  }

  return { assigned, associated, missingRequired }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm vitest run apps/web/src/components/board/panels/variants/__tests__/slot-restore.vitest.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/panels/variants/slot-engine.ts apps/web/src/components/board/panels/variants/__tests__/slot-restore.vitest.ts
git commit -m "feat(board): add restoreOrAssign function for cached slot assignment recovery"
```

---

### Task 3: MediaSlot 关联节点样式

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/shared/MediaSlot.tsx`

- [ ] **Step 1: 为 MediaSlot 添加 associated 样式 prop**

在 `MediaSlotProps` 接口中新增：

```typescript
export type MediaSlotProps = {
  // ... 现有 props
  associated?: boolean  // 新增：关联节点弱化样式
}
```

- [ ] **Step 2: 在渲染中应用样式**

在 MediaSlot 组件的容器 className 中，根据 `associated` prop 应用不同样式：

```typescript
// 容器样式（约第 110 行）
const containerCls = cn(
  compact ? 'h-[44px] w-[44px]' : 'h-[52px] w-[52px]',
  'relative shrink-0 overflow-hidden rounded-lg border-2 transition-all duration-150',
  associated
    ? 'border-dashed border-muted-foreground/30 opacity-50 hover:opacity-100 cursor-pointer'
    : src
      ? 'border-primary/60'
      : 'border-dashed border-muted-foreground/40',
)
```

- [ ] **Step 3: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/MediaSlot.tsx
git commit -m "feat(board): add associated style variant to MediaSlot"
```

---

### Task 3b: i18n 补充（在 InputSlotBar 重构前完成）

**Files:**
- Modify: `apps/web/src/i18n/locales/zh-CN/board.json`
- Modify: `apps/web/src/i18n/locales/en-US/board.json`
- Modify: `apps/web/src/i18n/locales/ja-JP/board.json`
- Modify: `apps/web/src/i18n/locales/zh-TW/board.json`

- [ ] **Step 1: 添加统一插槽系统的 i18n key**

需要新增的 key（在四个语言文件中分别添加）：

| key | zh-CN | en-US | ja-JP | zh-TW |
|-----|-------|-------|-------|-------|
| `slot.associatedRefs` | 关联节点 | Associated | 関連ノード | 關聯節點 |
| `slot.swapHint` | 点击选择替换 | Click to swap | クリックして交換 | 點擊選擇替換 |
| `slot.uploadFile` | 上传文件 | Upload file | ファイルをアップロード | 上傳檔案 |
| `slot.emptySlot` | 点击上传或从关联节点拖入 | Click to upload or assign | アップロードまたは割り当て | 點擊上傳或從關聯節點拖入 |

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/i18n/locales/
git commit -m "feat(i18n): add unified slot system i18n keys for all locales"
```

---

### Task 4: InputSlotBar 重构 — 双区布局

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx`
- Test: `apps/web/src/components/board/panels/variants/__tests__/variant-components.vitest.tsx`

这是核心改动。InputSlotBar 需要：
1. 接收 `cachedAssignment` 和 `onSlotAssignmentChange` 回调
2. 使用 `restoreOrAssign` 替代 `assignUpstreamToSlots`
3. 渲染双区布局：功能插槽 + 关联节点
4. 实现单行/双行自适应

- [ ] **Step 1: 更新 InputSlotBarProps**

```typescript
import type { PersistedSlotMap } from '../slot-types'
import { restoreOrAssign } from '../slot-engine'
import type { UnifiedSlotResult } from '../slot-engine'

export type InputSlotBarProps = {
  slots: InputSlotDefinition[]
  upstream: UpstreamData
  fileContext: BoardFileContext | undefined
  nodeResource?: { type: MediaType; url?: string; path?: string }
  disabled?: boolean
  cachedAssignment?: PersistedSlotMap           // 新增
  onAssignmentChange?: (resolved: ResolvedSlotInputs) => void
  onSlotAssignmentChange?: (map: PersistedSlotMap) => void  // 新增：持久化回调
}
```

- [ ] **Step 2: 替换分配逻辑为 restoreOrAssign**

将现有的 `autoAssignment` useMemo 替换为：

```typescript
const unifiedResult = useMemo(
  () => restoreOrAssign(slots, pools, cachedAssignment),
  [slots, pools, cachedAssignment],
)
```

用 `unifiedResult.assigned` 初始化 `slotAssignments` state，用 `unifiedResult.associated` 渲染关联区。

- [ ] **Step 3: 实现双区渲染布局**

```tsx
const totalCount = activeSlotCount + unifiedResult.associated.length
const isSingleRow = totalCount <= 7

return (
  <div className="flex flex-col gap-3">
    {/* 文本引用池（保持不变） */}
    {textSlots.length > 0 && /* ... existing text rendering ... */}

    {/* 媒体插槽双区 */}
    {mediaSlots.length > 0 && (
      <div className={cn('flex flex-wrap gap-2', !isSingleRow && 'flex-col')}>
        {isSingleRow ? (
          /* 单行：功能插槽 | 分隔线 | 关联节点 */
          <div className="flex items-center gap-2">
            {mediaSlots.map(slot => (
              <ActiveSlotItem key={slot.id} slot={slot} refs={slotAssignments[slot.id]} />
            ))}
            {unifiedResult.associated.length > 0 && (
              <>
                <div className="h-8 w-px bg-border" />
                {unifiedResult.associated.map(item => (
                  <AssociatedRefItem key={item.nodeId} mediaRef={item} />
                ))}
              </>
            )}
          </div>
        ) : (
          /* 双行：第一行功能插槽，第二行关联节点 */
          <>
            <div className="flex flex-wrap items-center gap-2">
              {mediaSlots.map(slot => (
                <ActiveSlotItem key={slot.id} slot={slot} refs={slotAssignments[slot.id]} />
              ))}
            </div>
            {unifiedResult.associated.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 opacity-70">
                {unifiedResult.associated.map(item => (
                  <AssociatedRefItem key={item.nodeId} mediaRef={item} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )}
  </div>
)
```

- [ ] **Step 4: 实现 ActiveSlotItem 子组件**

在 InputSlotBar.tsx 内部定义：

```tsx
function ActiveSlotItem({
  slot,
  refs,
  disabled,
  onSwap,
}: {
  slot: InputSlotDefinition
  refs: PoolReference[]
  disabled?: boolean
  onSwap?: (slotId: string) => void
}) {
  const { t } = useTranslation('board')
  const mediaRef = refs.find(isMediaReference) as MediaReference | undefined

  return (
    <div className="flex flex-col items-center gap-0.5">
      <MediaSlot
        label={t(slot.labelKey)}
        src={mediaRef?.url}
        required={slot.min > 0}
        compact
        disabled={disabled}
        onUpload={/* ... */}
        onRemove={/* ... */}
      />
      <span className="max-w-[44px] truncate text-[10px] text-muted-foreground">
        {t(slot.labelKey)}
      </span>
    </div>
  )
}
```

- [ ] **Step 5: 实现 AssociatedRefItem 子组件**

```tsx
function AssociatedRefItem({
  mediaRef,
  onClick,
}: {
  mediaRef: MediaReference
  onClick?: (ref: MediaReference) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div onClick={() => onClick?.(mediaRef)}>
          <MediaSlot
            label=""
            src={mediaRef.url}
            compact
            associated
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {mediaRef.nodeType} node
      </TooltipContent>
    </Tooltip>
  )
}
```

- [ ] **Step 6: 实现 slotAssignment 持久化回调**

在 `slotAssignments` state 变更时，生成 `PersistedSlotMap` 并回调：

```typescript
const emitSlotAssignment = useCallback(() => {
  if (!onSlotAssignmentChange) return
  const map: PersistedSlotMap = {}
  for (const slot of slots) {
    const refs = slotAssignments[slot.id] ?? []
    const mediaRef = refs.find(isMediaReference) as MediaReference | undefined
    if (mediaRef) {
      if (mediaRef.nodeId.startsWith('__manual_')) {
        map[slot.id] = `manual:${mediaRef.path}`
      } else {
        map[slot.id] = mediaRef.nodeId
      }
    }
  }
  onSlotAssignmentChange(map)
}, [slots, slotAssignments, onSlotAssignmentChange])

useEffect(() => {
  emitSlotAssignment()
}, [emitSlotAssignment])
```

- [ ] **Step 7: 更新现有测试**

在 `variant-components.vitest.tsx` 中确认 InputSlotBar 新增 props 的兼容性测试。确保不传 `cachedAssignment` 时行为与之前一致。

- [ ] **Step 8: 运行测试**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm vitest run apps/web/src/components/board/panels/variants/__tests__/`

- [ ] **Step 9: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx apps/web/src/components/board/panels/variants/__tests__/
git commit -m "feat(board): refactor InputSlotBar with dual-zone layout and cache restore"
```

---

### Task 5: 点击交换交互

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx`

- [ ] **Step 1: 实现 handleAssociatedClick — 点击关联节点填入空位或替换**

```typescript
const handleAssociatedClick = useCallback((clickedRef: MediaReference) => {
  // 找到匹配类型的空功能插槽
  const emptySlot = slots.find(s =>
    s.mediaType === clickedRef.nodeType &&
    (!slotAssignments[s.id] || slotAssignments[s.id].length === 0)
  )

  if (emptySlot) {
    // 直接填入空位
    setSlotAssignments(prev => ({
      ...prev,
      [emptySlot.id]: [clickedRef],
    }))
    return
  }

  // 没有空位 → 打开选择器让用户选择替换哪个插槽
  setSwapContext({ ref: clickedRef, mode: 'pick-slot' })
}, [slots, slotAssignments])
```

- [ ] **Step 2: 实现 handleActiveSlotClick — 点击功能插槽弹出选择器**

```typescript
const handleActiveSlotClick = useCallback((slotId: string) => {
  setSwapContext({ slotId, mode: 'pick-ref' })
}, [])
```

- [ ] **Step 3: 实现 SwapPopover 选择器组件**

使用 Radix Popover，根据 swapContext.mode 显示不同内容：

```tsx
function SlotSwapPopover({
  context,
  slots,
  associated,
  slotAssignments,
  onSelect,
  onClose,
}: {
  context: SwapContext
  slots: InputSlotDefinition[]
  associated: MediaReference[]
  slotAssignments: Record<string, PoolReference[]>
  onSelect: (action: SwapAction) => void
  onClose: () => void
}) {
  if (context.mode === 'pick-slot') {
    // 展示匹配类型的功能插槽列表，让用户选择替换哪个
    const matchingSlots = slots.filter(s => s.mediaType === context.ref!.nodeType)
    return (
      <PopoverContent>
        {matchingSlots.map(slot => (
          <button key={slot.id} onClick={() => onSelect({ type: 'swap-into-slot', slotId: slot.id, ref: context.ref! })}>
            {t(slot.labelKey)}
            {/* 显示当前插槽内容的缩略图 */}
          </button>
        ))}
      </PopoverContent>
    )
  }

  if (context.mode === 'pick-ref') {
    // 展示关联区中同类型的节点 + 手动上传选项
    const slot = slots.find(s => s.id === context.slotId)!
    const matchingRefs = associated.filter(r => r.nodeType === slot.mediaType)
    return (
      <PopoverContent>
        {matchingRefs.map(ref => (
          <button key={ref.nodeId} onClick={() => onSelect({ type: 'assign-ref', slotId: context.slotId!, ref })}>
            {/* 缩略图 + 节点名称 */}
          </button>
        ))}
        {slot.allowManualInput && (
          <button onClick={() => onSelect({ type: 'manual-upload', slotId: context.slotId! })}>
            上传文件
          </button>
        )}
      </PopoverContent>
    )
  }
}
```

- [ ] **Step 4: 实现 executeSwap — 执行交换并更新 state**

```typescript
const executeSwap = useCallback((action: SwapAction) => {
  setSlotAssignments(prev => {
    const next = { ...prev }
    if (action.type === 'swap-into-slot') {
      // 把功能插槽中的旧引用释放，新引用填入
      next[action.slotId] = [action.ref]
    } else if (action.type === 'assign-ref') {
      next[action.slotId] = [action.ref]
    }
    return next
  })
  setSwapContext(null)
}, [])
```

- [ ] **Step 5: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx
git commit -m "feat(board): add click-to-swap interaction between active slots and associated refs"
```

---

### Task 6: 面板集成 — ImageAiPanel

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx`

- [ ] **Step 1: 将 rawUpstream 传递给 InputSlotBar**

在 ImageAiPanel 中，将原始 `UpstreamData`（而非处理后的 VariantUpstream）传递给 InputSlotBar：

找到面板组件 props 中的 `rawUpstream` prop（已由 ImageNode 传入），传给 InputSlotBar：

```tsx
{selectedVariant?.inputSlots && (
  <InputSlotBar
    slots={selectedVariant.inputSlots}
    upstream={rawUpstream}
    fileContext={fileContext}
    nodeResource={nodeResource}
    disabled={readonly || isGenerating}
    cachedAssignment={
      paramsCacheLocal.current[`${selectedFeatureId}:${selectedVariant.id}`]?.slotAssignment
    }
    onAssignmentChange={handleSlotInputsChange}
    onSlotAssignmentChange={handleSlotAssignmentPersist}
  />
)}
```

- [ ] **Step 2: 实现 handleSlotAssignmentPersist 回调**

```typescript
const handleSlotAssignmentPersist = useCallback((map: PersistedSlotMap) => {
  // 更新当前 variantParamsRef 的 slotAssignment
  variantParamsRef.current = {
    ...variantParamsRef.current,
    slotAssignment: map,
  }
}, [])
```

- [ ] **Step 3: 实现 handleSlotInputsChange — 将 InputSlotBar 的分配结果传给 variant**

```typescript
const [resolvedSlots, setResolvedSlots] = useState<Record<string, MediaReference[]>>({})

const handleSlotInputsChange = useCallback((resolved: ResolvedSlotInputs) => {
  // mediaRefs 由 InputSlotBar 在 ResolvedSlotInputs 中提供（Task 1 Step 3c 已扩展类型）
  setResolvedSlots(resolved.mediaRefs)
}, [])
```

- [ ] **Step 4: 传递 resolvedSlots 给 VariantForm**

```tsx
<VariantForm
  variant={selectedVariant}
  upstream={variantUpstream}
  nodeResourceUrl={resolvedImageSrc}
  nodeResourcePath={element.props.originalSrc}
  disabled={readonly || isGenerating || maskPainting}
  initialParams={initialParams}
  onParamsChange={handleVariantParamsChange}
  onWarningChange={setVariantWarning}
  resolvedSlots={resolvedSlots}  // 新增
/>
```

- [ ] **Step 5: 确保 persistCacheToNode 包含 slotAssignment**

现有的 `persistCacheToNode` 已经将整个 `variantParamsRef.current` 写入 paramsCache，由于 Step 2 中已将 slotAssignment 写入 variantParamsRef，无需额外改动。确认 `aiConfig.paramsCache` 的类型定义兼容。

检查 `board-contracts.ts` 中 `AiGenerateConfig.paramsCache` 的类型。如果是严格类型（不含 slotAssignment），需要放宽：

```typescript
paramsCache?: Record<string, VariantParamsSnapshot>
```

替换现有的内联类型定义。

- [ ] **Step 6: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/board/panels/ImageAiPanel.tsx apps/web/src/components/board/board-contracts.ts
git commit -m "feat(board): integrate unified slot system into ImageAiPanel"
```

---

### Task 7: 面板集成 — VideoAiPanel + AudioAiPanel

**Files:**
- Modify: `apps/web/src/components/board/panels/VideoAiPanel.tsx`
- Modify: `apps/web/src/components/board/panels/AudioAiPanel.tsx`

- [ ] **Step 1: VideoAiPanel — 同 Task 6 的模式**

复制 ImageAiPanel 的集成模式：
- 传递 `rawUpstream` 给 InputSlotBar
- 添加 `handleSlotAssignmentPersist` 和 `handleSlotInputsChange`
- 传递 `resolvedSlots` 给 VariantForm

- [ ] **Step 2: AudioAiPanel — 同上**

注意 AudioAiPanel 的 upstream 结构可能略有不同（主要是 audio 类型），但 InputSlotBar 是通用的。

- [ ] **Step 3: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/VideoAiPanel.tsx apps/web/src/components/board/panels/AudioAiPanel.tsx
git commit -m "feat(board): integrate unified slot system into VideoAiPanel and AudioAiPanel"
```

---

### Task 8: Variant 迁移 — 第一批（ImgGenVolcVariant 示例）

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/image/ImgGenVolcVariant.tsx`

此 Task 示范迁移模式，后续 variant 按此模式批量迁移。

- [ ] **Step 1: 读取 ImgGenVolcVariant 当前实现**

了解它目前如何自行渲染 MediaSlotGroup 和处理 upstream。

- [ ] **Step 2: 移除内部 MediaSlotGroup 渲染**

将内部的 `useMediaSlots` + `MediaSlotGroup` 渲染逻辑移除。

- [ ] **Step 3: 改用 resolvedSlots prop**

```typescript
export function ImgGenVolcVariant({
  variant,
  upstream,
  nodeResourceUrl,
  nodeResourcePath,
  disabled,
  initialParams,
  onParamsChange,
  resolvedSlots,  // 新增
}: VariantFormProps) {
  // 从 resolvedSlots 获取已分配的图片，而非自己做分配
  const assignedImages = resolvedSlots?.images ?? []
  const apiImages = assignedImages.map(ref => ref.path ? toMediaInput(ref.path) : toMediaInput(ref.url))

  // ... 参数表单渲染不变
  // ... onParamsChange 中使用 apiImages
}
```

- [ ] **Step 4: 如果 variant 没有声明 inputSlots（兼容旧行为），保留原有 MediaSlotGroup**

检查 `image/index.ts` 中该 variant 是否已有 `inputSlots` 声明。如果有，框架层已接管，variant 内部可以移除。如果没有，需要先补充 `inputSlots` 声明。

- [ ] **Step 5: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/board/panels/variants/image/ImgGenVolcVariant.tsx
git commit -m "refactor(board): migrate ImgGenVolcVariant to use resolvedSlots from InputSlotBar"
```

---

### Task 9: 剩余 Variant 批量迁移

**Files:**
- Modify: 所有 `apps/web/src/components/board/panels/variants/image/*.tsx`
- Modify: 所有 `apps/web/src/components/board/panels/variants/video/*.tsx`
- Modify: 所有 `apps/web/src/components/board/panels/variants/audio/*.tsx`（如有）

- [ ] **Step 1: 列出所有需要迁移的 variant**

在 `image/index.ts`、`video/index.ts`、`audio/index.ts` 中扫描所有注册的 variant。

- [ ] **Step 2: 逐个迁移**

每个 variant 按 Task 8 的模式：
1. 确认 `inputSlots` 已声明
2. 移除内部 MediaSlotGroup
3. 改用 `resolvedSlots`

- [ ] **Step 3: 运行全量测试**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm vitest run apps/web/src/components/board/`

- [ ] **Step 4: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/panels/variants/
git commit -m "refactor(board): migrate all variants to unified slot system"
```

---

### Task 10: 版本堆叠快照兼容

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx`
- Modify: 各面板的 handleGenerate 函数（ImageAiPanel/VideoAiPanel/AudioAiPanel）

- [ ] **Step 1: 生成时将 slotAssignment 快照到 upstreamRefs**

在各面板的 `handleGenerate` 函数中，现有的 `upstreamRefs` 快照逻辑已经会记录上游引用。确保 `slotAssignment` 中的分配关系也被包含在快照中。具体做法：在 `InputSnapshot` 中保存当前 `slotAssignment`，使得版本堆叠切换时能恢复。

- [ ] **Step 2: 查看历史版本时插槽区变为只读**

在 InputSlotBar 中添加 `readonly` prop。当面板显示的是历史版本（`primaryEntry.status === 'ready'`）时，传入 `readonly={true}`，禁用所有交换/上传操作，插槽区仅展示冻结时的分配状态。

- [ ] **Step 3: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/
git commit -m "feat(board): add version-stack snapshot and readonly mode for slot assignments"
```

---

### Task 11: 空插槽脉冲动画提示

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/shared/MediaSlot.tsx`

- [ ] **Step 1: 添加 pulse 样式 prop**

在 `MediaSlotProps` 中新增 `pulse?: boolean`。当为 true 且插槽为空时，应用微弱脉冲动画：

```typescript
const containerCls = cn(
  // ... 现有样式
  pulse && !src && 'animate-pulse',
)
```

使用 Tailwind 内置的 `animate-pulse`，同时添加 `prefers-reduced-motion` 适配：

```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse { animation: none; }
}
```

（Tailwind 4 默认已处理 `prefers-reduced-motion`，确认即可）

- [ ] **Step 2: 在 InputSlotBar 中当关联区有匹配类型节点且功能插槽为空时传入 pulse**

```tsx
<ActiveSlotItem
  slot={slot}
  refs={slotAssignments[slot.id]}
  pulse={
    (slotAssignments[slot.id]?.length ?? 0) === 0 &&
    unifiedResult.associated.some(r => r.nodeType === slot.mediaType)
  }
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/MediaSlot.tsx apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx
git commit -m "feat(board): add pulse animation hint for empty slots with available associated refs"
```

---

### Task 12: 端到端验证

- [ ] **Step 1: 运行全量测试**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm vitest run`

- [ ] **Step 2: 运行类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: 运行 lint**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check`

- [ ] **Step 4: 手动测试场景**

启动 dev 环境：`pnpm run dev`

测试场景：
1. 图片节点连接 2 个图片父节点 → 打开面板 → 两个都显示，1 个在功能插槽，1 个在关联区
2. 点击关联节点 → 填入空插槽或交换
3. 切换 variant → 自动重新分配
4. 切换回之前的 variant → 恢复之前的手动分配
5. 删除一条连线 → 对应插槽变空
6. 新增一条连线 → 新节点自动填入或进入关联区
7. 连接 7+ 个父节点 → 双行显示
