import { describe, it, expect, vi } from 'vitest'

// Mock external dependencies that planFileService imports at top level
vi.mock('@/ai/services/chat/repositories/chatFileStore', () => ({
  resolveSessionDir: vi.fn(),
}))
vi.mock('@/ai/services/chat/repositories/chatMessagePersistence', () => ({
  withSessionLock: vi.fn((_id: string, fn: () => Promise<any>) => fn()),
}))

import {
  renderPlanMarkdown,
  parsePlanFrontMatter,
} from '../planFileService'

describe('planFileService', () => {
  const samplePlan = [
    '分析现有代码结构',
    '设计新的 OAuth 流程',
    '实现 Google OAuth provider',
  ]

  describe('renderPlanMarkdown', () => {
    it('should render plan with YAML front matter and numbered steps', () => {
      const md = renderPlanMarkdown({
        planNo: 1,
        status: 'active',
        actionName: '重构认证模块',
        explanation: '迁移到 OAuth 2.0',
        plan: samplePlan,
      })

      expect(md).toContain('planNo: 1')
      expect(md).toContain('status: active')
      expect(md).toContain('# 重构认证模块')
      expect(md).toContain('## 方案说明')
      expect(md).toContain('迁移到 OAuth 2.0')
      expect(md).toContain('1. 分析现有代码结构')
      expect(md).toContain('2. 设计新的 OAuth 流程')
      expect(md).toContain('3. 实现 Google OAuth provider')
      // No XML tags
      expect(md).not.toContain('<plan-steps>')
      expect(md).not.toContain('<step')
    })

    it('should render without explanation if not provided', () => {
      const md = renderPlanMarkdown({
        planNo: 2,
        status: 'active',
        actionName: '修复 Bug',
        plan: ['定位问题'],
      })

      expect(md).not.toContain('## 方案说明')
      expect(md).toContain('# 修复 Bug')
      expect(md).toContain('1. 定位问题')
    })
  })

  describe('parsePlanFrontMatter', () => {
    it('should parse YAML front matter', () => {
      const md = renderPlanMarkdown({
        planNo: 3,
        status: 'completed',
        actionName: 'Test',
        plan: samplePlan,
      })

      const meta = parsePlanFrontMatter(md)
      expect(meta.planNo).toBe(3)
      expect(meta.status).toBe('completed')
      expect(meta.createdAt).toBeDefined()
      expect(meta.updatedAt).toBeDefined()
    })

    it('should return empty for no front matter', () => {
      const meta = parsePlanFrontMatter('# Just a heading')
      expect(meta).toEqual({})
    })
  })
})
