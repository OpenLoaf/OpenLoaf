/**
 * SkillMarketHarness — 技能市场页面测试容器。
 *
 * 在通用 PageProbeHarness 外层里挂载真实的 SkillMarketplace 组件，
 * 通过 data-testid 观察 loading/error/empty/grid 状态推导 ready/error，
 * 把卡片数量写入 payload。
 *
 * 依赖的 testid（由 SkillMarketplace / SkillMarketCard 提供）：
 * - skill-marketplace               根容器
 * - skill-market-loading            加载中 skeleton 容器
 * - skill-market-error              错误态容器
 * - skill-market-empty              空态容器（data-empty-reason=no-results|no-skills）
 * - skill-market-grid               卡片网格容器（data-card-count）
 * - skill-market-card               单个卡片（data-skill-id）
 */
import * as React from 'react'
import PageProbeHarness, { usePageProbe } from './PageProbeHarness'
import { SkillMarketplace } from '@/components/setting/skills/SkillMarketplace'

export type SkillMarketHarnessProps = {
  /** 后端服务地址（用于状态栏展示） */
  serverUrl?: string
  /** 可选项目 ID，传入则走 project 作用域 */
  projectId?: string
  /** 就绪判定超时毫秒数，默认 20s */
  readyTimeoutMs?: number
  /** 完成回调 */
  onComplete?: (payload: {
    status: 'ready' | 'error'
    cardCount: number
    errorText?: string
    emptyState?: boolean
    emptyReason?: 'no-results' | 'no-skills'
  }) => void
  className?: string
}

/**
 * 观察 data-testid 判断列表是否已加载完成。
 * 优先级：error > empty > grid > 继续等 > 超时
 */
function SkillMarketReadinessWatcher({
  readyTimeoutMs = 20_000,
  onComplete,
}: {
  readyTimeoutMs?: number
  onComplete?: SkillMarketHarnessProps['onComplete']
}) {
  const probe = usePageProbe()
  const doneRef = React.useRef(false)

  React.useEffect(() => {
    const deadline = Date.now() + readyTimeoutMs

    const check = () => {
      if (doneRef.current) return true

      // 1. 错误态
      const errorEl = document.querySelector('[data-testid="skill-market-error"]')
      if (errorEl) {
        doneRef.current = true
        const msg = errorEl.textContent?.trim().slice(0, 300) ?? 'unknown error'
        probe.reportError(msg)
        onComplete?.({ status: 'error', cardCount: 0, errorText: msg })
        return true
      }

      // 2. 空态
      const emptyEl = document.querySelector('[data-testid="skill-market-empty"]')
      if (emptyEl) {
        doneRef.current = true
        const reason = (emptyEl.getAttribute('data-empty-reason') ?? 'no-skills') as
          'no-results' | 'no-skills'
        probe.reportReady({ cardCount: 0, emptyState: true, emptyReason: reason })
        onComplete?.({ status: 'ready', cardCount: 0, emptyState: true, emptyReason: reason })
        return true
      }

      // 3. 有卡片网格
      const gridEl = document.querySelector('[data-testid="skill-market-grid"]')
      if (gridEl) {
        const attr = gridEl.getAttribute('data-card-count')
        const cardCount = attr ? Number.parseInt(attr, 10) : gridEl.querySelectorAll(
          '[data-testid="skill-market-card"]',
        ).length
        doneRef.current = true
        probe.reportReady({ cardCount })
        onComplete?.({ status: 'ready', cardCount })
        return true
      }

      // 4. loading 中 → 继续等
      const loadingEl = document.querySelector('[data-testid="skill-market-loading"]')
      if (loadingEl && Date.now() <= deadline) return false

      // 5. 超时
      if (Date.now() > deadline) {
        doneRef.current = true
        probe.reportError(`timeout after ${readyTimeoutMs}ms (no grid/error/empty reached)`)
        onComplete?.({ status: 'error', cardCount: 0, errorText: 'ready timeout' })
        return true
      }
      return false
    }

    if (check()) return
    const timer = window.setInterval(() => {
      if (check()) window.clearInterval(timer)
    }, 400)
    return () => window.clearInterval(timer)
  }, [probe, readyTimeoutMs, onComplete])

  return null
}

export default function SkillMarketHarness(props: SkillMarketHarnessProps) {
  const { serverUrl, projectId, readyTimeoutMs, onComplete, className } = props
  return (
    <PageProbeHarness serverUrl={serverUrl} className={className}>
      <SkillMarketReadinessWatcher
        readyTimeoutMs={readyTimeoutMs}
        onComplete={onComplete}
      />
      <SkillMarketplace projectId={projectId} />
    </PageProbeHarness>
  )
}
