/**
 * TDD RED 阶段 — 证明画布缺少视口裁剪的问题
 *
 * 问题：DomNodeLayer 无条件渲染 snapshot.elements 中的所有节点，
 * 不考虑节点是否在当前视口内。SpatialIndex 已存在于 CanvasDoc 中，
 * 但 getSnapshot() 返回全量元素，没有视口过滤。
 *
 * 期望行为：CanvasEngine 应提供 getVisibleElements() 方法，
 * 利用 SpatialIndex 只返回视口内（含 buffer）的节点。
 */
import { describe, it, expect } from 'vitest'
import { SpatialIndex } from '../engine/SpatialIndex'

describe('Viewport culling', () => {
  // ---------------------------------------------------------------------------
  // SpatialIndex 基础功能验证（现有功能，应通过）
  // ---------------------------------------------------------------------------
  describe('SpatialIndex (existing)', () => {
    it('should correctly insert and query nodes', () => {
      const index = new SpatialIndex(100)
      index.insert('node-1', { x: 0, y: 0, w: 50, h: 50 })
      index.insert('node-2', { x: 200, y: 200, w: 50, h: 50 })
      index.insert('node-3', { x: 500, y: 500, w: 50, h: 50 })

      // 查询左上角区域
      const results = index.query({ x: -10, y: -10, w: 120, h: 120 })
      expect(results).toContain('node-1')
      expect(results).not.toContain('node-3')
    })

    it('should support rebuild from node array', () => {
      const index = new SpatialIndex(100)
      const nodes = [
        { id: 'n1', type: 'text', kind: 'node' as const, xywh: [0, 0, 100, 100] as [number, number, number, number] },
        { id: 'n2', type: 'text', kind: 'node' as const, xywh: [500, 500, 100, 100] as [number, number, number, number] },
      ]
      index.rebuild(nodes as any)

      const results = index.query({ x: -50, y: -50, w: 200, h: 200 })
      expect(results).toContain('n1')
      expect(results).not.toContain('n2')
    })
  })

  // ---------------------------------------------------------------------------
  // 视口裁剪方法（期望行为，当前不存在）
  // ---------------------------------------------------------------------------
  describe('getVisibleElements (desired behavior)', () => {
    /**
     * 期望：CanvasEngine 或 CanvasDoc 应提供一个 getVisibleElements() 方法，
     * 接受当前视口状态，返回在视口内（含 buffer）的节点列表。
     *
     * 世界坐标视口计算：
     *   worldX = -offset[0] / zoom
     *   worldY = -offset[1] / zoom
     *   worldW = size[0] / zoom
     *   worldH = size[1] / zoom
     */
    function computeViewportWorldRect(viewport: {
      zoom: number
      offset: [number, number]
      size: [number, number]
    }, bufferRatio = 0.25) {
      const { zoom, offset, size } = viewport
      const worldX = -offset[0] / zoom
      const worldY = -offset[1] / zoom
      const worldW = size[0] / zoom
      const worldH = size[1] / zoom

      // 扩展 buffer 区域
      const bw = worldW * bufferRatio
      const bh = worldH * bufferRatio

      return {
        x: worldX - bw,
        y: worldY - bh,
        w: worldW + bw * 2,
        h: worldH + bh * 2,
      }
    }

    it('should correctly compute world-space viewport rect', () => {
      const viewport = {
        zoom: 1,
        offset: [0, 0] as [number, number],
        size: [1920, 1080] as [number, number],
      }

      const rect = computeViewportWorldRect(viewport, 0)
      expect(rect.x).toBeCloseTo(0)
      expect(rect.y).toBeCloseTo(0)
      expect(rect.w).toBe(1920)
      expect(rect.h).toBe(1080)
    })

    it('should correctly compute world rect with zoom', () => {
      const viewport = {
        zoom: 2,
        offset: [-200, -100] as [number, number],
        size: [1920, 1080] as [number, number],
      }

      const rect = computeViewportWorldRect(viewport, 0)
      expect(rect.x).toBe(100) // -(-200)/2
      expect(rect.y).toBe(50)  // -(-100)/2
      expect(rect.w).toBe(960) // 1920/2
      expect(rect.h).toBe(540) // 1080/2
    })

    it('should filter nodes using SpatialIndex + viewport', () => {
      const index = new SpatialIndex(200)

      // 创建 100 个分散的节点
      const allNodes: Array<{
        id: string
        type: string
        kind: 'node'
        xywh: [number, number, number, number]
      }> = []

      for (let i = 0; i < 100; i++) {
        const x = (i % 10) * 500
        const y = Math.floor(i / 10) * 500
        allNodes.push({
          id: `node-${i}`,
          type: 'text',
          kind: 'node',
          xywh: [x, y, 200, 200],
        })
      }

      index.rebuild(allNodes as any)

      // 视口只覆盖左上角区域（无 buffer）
      const viewport = {
        zoom: 1,
        offset: [0, 0] as [number, number],
        size: [1920, 1080] as [number, number],
      }

      const rect = computeViewportWorldRect(viewport, 0)
      const visibleIds = index.query(rect)

      // 视口 1920x1080 应该只包含前几行几列的节点
      // x: 0-1920，节点间距 500，所以 x=0,500,1000,1500 四列 → index 0,1,2,3
      // y: 0-1080，节点间距 500，所以 y=0,500,1000 三行 → index 0,1,2
      // 总共应约 12 个节点（远少于 100）
      expect(visibleIds.length).toBeLessThan(100)
      expect(visibleIds.length).toBeGreaterThan(0)
      expect(visibleIds.length).toBeLessThanOrEqual(20) // 宽松上界

      // 远处的节点不应包含在内
      expect(visibleIds).not.toContain('node-99') // 位于 (4500, 4500)
      expect(visibleIds).not.toContain('node-55') // 位于 (2500, 2500)
    })

    it('CanvasEngine should expose getVisibleElements method', async () => {
      // ❌ 当前失败：CanvasEngine 没有 getVisibleElements 方法
      let hasMethod = false
      try {
        const mod = await import('../engine/CanvasEngine')
        const EngineClass = (mod as any).CanvasEngine
        if (EngineClass) {
          hasMethod = typeof EngineClass.prototype.getVisibleElements === 'function'
        }
      } catch {
        hasMethod = false
      }

      expect(hasMethod).toBe(true)
    })
  })
})
