import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the module
vi.mock('@/utils/server-url', () => ({
  resolveServerUrl: () => 'https://api.test',
}))

vi.mock('@/lib/saas-media', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/saas-media')>()
  return {
    ...original,
    buildAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
  }
})

import {
  requestQueueTicket,
  uploadQueueResource,
  cancelQueueTicket,
  subscribeQueueEvents,
} from '@/lib/saas-media'

describe('saas-media queue API', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  it('requestQueueTicket 正确调用 POST /ai/v3/queue', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ticketId: 't1', position: 3, status: 'queued' } }),
    })

    await requestQueueTicket({ feature: 'img2img', variant: 'v1', count: 2 })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.test/ai/v3/queue')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body).toMatchObject({ feature: 'img2img', variant: 'v1', count: 2 })
  })

  it('uploadQueueResource 正确调用 POST /ai/v3/upload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { resourceId: 'r1', precheck: 'passed' } }),
    })

    const file = new Blob(['test'], { type: 'image/png' })
    await uploadQueueResource('t1', 'variant-a', file as any)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.test/ai/v3/upload')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeInstanceOf(FormData)
    const fd: FormData = opts.body
    expect(fd.get('ticketId')).toBe('t1')
    expect(fd.get('variant')).toBe('variant-a')
    expect(fd.get('file')).toBeTruthy()
  })

  it('cancelQueueTicket 正确调用 POST /ai/v3/queue/:ticketId/cancel', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })

    await cancelQueueTicket('t99')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.test/ai/v3/queue/t99/cancel')
    expect(opts.method).toBe('POST')
  })

  it('subscribeQueueEvents 返回 cleanup 函数', () => {
    const mockES = { addEventListener: vi.fn(), close: vi.fn(), onerror: null }
    vi.stubGlobal('EventSource', vi.fn().mockImplementation(() => mockES))

    const cleanup = subscribeQueueEvents('t1', {})
    expect(typeof cleanup).toBe('function')
  })

  it('requestQueueTicket 解析响应 { ticketId, position, status }', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ticketId: 'abc', position: 5, status: 'waiting' } }),
    })

    const result = await requestQueueTicket({ feature: 'txt2img', variant: 'v2' })
    expect(result).toEqual({ ticketId: 'abc', position: 5, status: 'waiting' })
  })
})
