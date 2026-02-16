import { describe, expect, it, vi } from 'vitest'

// 逻辑：mock @lobehub/icons 避免 JSON import 属性问题
vi.mock('@lobehub/icons', () => ({
  Alibaba: { Color: () => null },
  Apple: () => null,
  Google: { Color: () => null },
  Microsoft: { Color: () => null },
  Tencent: { Color: () => null },
}))

import {
  detectProviderByEmail,
  getProviderById,
  EMAIL_PROVIDER_PRESETS,
} from '../email-provider-presets'

describe('detectProviderByEmail', () => {
  it('Gmail 域名', () => {
    const result = detectProviderByEmail('user@gmail.com')
    expect(result?.id).toBe('gmail')
  })
  it('Gmail 别名域名', () => {
    const result = detectProviderByEmail('user@googlemail.com')
    expect(result?.id).toBe('gmail')
  })
  it('QQ 邮箱', () => {
    const result = detectProviderByEmail('user@qq.com')
    expect(result?.id).toBe('qq')
  })
  it('Foxmail 域名匹配 QQ', () => {
    const result = detectProviderByEmail('user@foxmail.com')
    expect(result?.id).toBe('qq')
  })
  it('Outlook 域名', () => {
    const result = detectProviderByEmail('user@outlook.com')
    expect(result?.id).toBe('outlook')
  })
  it('iCloud 域名', () => {
    const result = detectProviderByEmail('user@icloud.com')
    expect(result?.id).toBe('icloud')
  })
  it('163 域名', () => {
    const result = detectProviderByEmail('user@163.com')
    expect(result?.id).toBe('163')
  })
  it('阿里邮箱域名', () => {
    const result = detectProviderByEmail('user@aliyun.com')
    expect(result?.id).toBe('aliyun')
  })
  it('Yahoo 域名', () => {
    const result = detectProviderByEmail('user@yahoo.com')
    expect(result?.id).toBe('yahoo')
  })
  it('未知域名返回 null', () => {
    expect(detectProviderByEmail('user@custom-domain.com')).toBeNull()
  })
  it('无 @ 符号返回 null', () => {
    expect(detectProviderByEmail('invalid-email')).toBeNull()
  })
  it('空字符串返回 null', () => {
    expect(detectProviderByEmail('')).toBeNull()
  })
})

describe('getProviderById', () => {
  it('获取 gmail', () => {
    const result = getProviderById('gmail')
    expect(result?.name).toBe('Gmail')
  })
  it('获取 custom', () => {
    const result = getProviderById('custom')
    expect(result?.name).toBe('其他邮箱')
  })
  it('获取 exchange', () => {
    const result = getProviderById('exchange')
    expect(result?.authType).toBe('oauth2')
  })
  it('不存在的 ID 返回 null', () => {
    expect(getProviderById('nonexistent')).toBeNull()
  })
})

describe('EMAIL_PROVIDER_PRESETS', () => {
  it('包含 custom 作为最后一项', () => {
    const last = EMAIL_PROVIDER_PRESETS[EMAIL_PROVIDER_PRESETS.length - 1]
    expect(last?.id).toBe('custom')
  })
  it('所有预设都有 id 和 name', () => {
    for (const preset of EMAIL_PROVIDER_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.name).toBeTruthy()
    }
  })
})
