import { describe, expect, it } from 'vitest'

import {
  normalizeEmail,
  extractEmailAddress,
  formatAttachmentSize,
  formatDateTime,
  formatMessageTime,
  hasEmailFlag,
  isJunkMailboxView,
  isTrashMailboxView,
  isInboxMailboxView,
  isDraftsMailboxView,
  isSentMailboxView,
  isFlaggedMailboxView,
  isMailboxSelectable,
  getMailboxLabel,
  resolveMailboxIcon,
  buildForwardSubject,
  buildForwardBody,
  buildMailboxTree,
  moveItem,
} from '../email-utils'
import type { EmailMailboxView } from '../email-types'

// ── normalizeEmail ──
describe('normalizeEmail', () => {
  it('转小写并去空格', () => {
    expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com')
  })
  it('空字符串', () => {
    expect(normalizeEmail('')).toBe('')
  })
})

// ── extractEmailAddress ──
describe('extractEmailAddress', () => {
  it('从 "Name <email>" 格式提取', () => {
    expect(extractEmailAddress('John Doe <john@example.com>')).toBe('john@example.com')
  })
  it('纯邮箱地址', () => {
    expect(extractEmailAddress('user@domain.org')).toBe('user@domain.org')
  })
  it('带空格的尖括号格式', () => {
    expect(extractEmailAddress('  < Alice@Test.COM >  ')).toBe('alice@test.com')
  })
  it('空字符串返回 null', () => {
    expect(extractEmailAddress('')).toBeNull()
  })
  it('无效输入返回 null', () => {
    expect(extractEmailAddress('not an email')).toBeNull()
  })
})

// ── formatAttachmentSize ──
describe('formatAttachmentSize', () => {
  it('字节', () => {
    expect(formatAttachmentSize(500)).toBe('500B')
  })
  it('KB', () => {
    expect(formatAttachmentSize(1024)).toBe('1KB')
  })
  it('MB', () => {
    expect(formatAttachmentSize(1024 * 1024)).toBe('1MB')
  })
  it('GB', () => {
    expect(formatAttachmentSize(1024 * 1024 * 1024)).toBe('1GB')
  })
  it('TB', () => {
    expect(formatAttachmentSize(1024 ** 4)).toBe('1TB')
  })
  it('小数精度 (< 10 保留一位)', () => {
    expect(formatAttachmentSize(1536)).toBe('1.5KB')
  })
  it('>= 10 取整', () => {
    expect(formatAttachmentSize(15 * 1024)).toBe('15KB')
  })
  it('undefined 返回 null', () => {
    expect(formatAttachmentSize(undefined)).toBeNull()
  })
  it('0 返回 null', () => {
    expect(formatAttachmentSize(0)).toBeNull()
  })
  it('负数返回 null', () => {
    expect(formatAttachmentSize(-100)).toBeNull()
  })
})

// ── formatDateTime ──
describe('formatDateTime', () => {
  it('格式化有效 ISO 日期', () => {
    const result = formatDateTime('2026-01-15T10:30:00Z')
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/01/)
    expect(result).toMatch(/15/)
  })
  it('undefined 返回空字符串', () => {
    expect(formatDateTime(undefined)).toBe('')
  })
  it('无效日期返回原始值', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })
})

// ── formatMessageTime ──
describe('formatMessageTime', () => {
  it('今天的日期只显示时间', () => {
    const now = new Date()
    const todayISO = now.toISOString()
    const result = formatMessageTime(todayISO)
    // 逻辑：今天应该只显示 HH:MM 格式
    expect(result).toMatch(/\d{2}:\d{2}/)
    expect(result).not.toMatch(/\d{4}/)
  })
  it('今年其他日期显示月/日', () => {
    const now = new Date()
    const pastDate = new Date(now.getFullYear(), 0, 1, 12, 0, 0)
    // 逻辑：如果今天就是 1 月 1 日，用 2 月代替
    if (now.getMonth() === 0 && now.getDate() === 1) {
      pastDate.setMonth(1)
    }
    const result = formatMessageTime(pastDate.toISOString())
    expect(result).toMatch(/\d{2}/)
  })
  it('不同年份显示年份', () => {
    const result = formatMessageTime('2020-06-15T10:00:00Z')
    expect(result).toMatch(/2020/)
  })
  it('undefined 返回空字符串', () => {
    expect(formatMessageTime(undefined)).toBe('')
  })
  it('无效日期返回原始值', () => {
    expect(formatMessageTime('invalid')).toBe('invalid')
  })
})

// ── hasEmailFlag ──
describe('hasEmailFlag', () => {
  it('精确匹配', () => {
    expect(hasEmailFlag(['\\Seen', '\\Flagged'], 'Flagged')).toBe(true)
  })
  it('大小写不敏感', () => {
    expect(hasEmailFlag(['\\SEEN'], 'seen')).toBe(true)
  })
  it('带反斜杠前缀的 target', () => {
    expect(hasEmailFlag(['\\Flagged'], '\\Flagged')).toBe(true)
  })
  it('不存在的 flag', () => {
    expect(hasEmailFlag(['\\Seen'], 'Flagged')).toBe(false)
  })
  it('空 flags 数组', () => {
    expect(hasEmailFlag([], 'Seen')).toBe(false)
  })
})

// ── Mailbox 视图判断函数 ──

function mb(overrides: Partial<EmailMailboxView>): EmailMailboxView {
  return { path: '', name: '', attributes: [], ...overrides }
}

describe('isInboxMailboxView', () => {
  it('\\Inbox 属性', () => {
    expect(isInboxMailboxView(mb({ attributes: ['\\Inbox'] }))).toBe(true)
  })
  it('path 为 INBOX', () => {
    expect(isInboxMailboxView(mb({ path: 'INBOX' }))).toBe(true)
  })
  it('非 inbox', () => {
    expect(isInboxMailboxView(mb({ path: 'Sent' }))).toBe(false)
  })
})

describe('isDraftsMailboxView', () => {
  it('\\Drafts 属性', () => {
    expect(isDraftsMailboxView(mb({ attributes: ['\\Drafts'] }))).toBe(true)
  })
  it('path 包含 draft', () => {
    expect(isDraftsMailboxView(mb({ path: 'Drafts' }))).toBe(true)
  })
  it('非 drafts', () => {
    expect(isDraftsMailboxView(mb({ path: 'INBOX' }))).toBe(false)
  })
})

describe('isSentMailboxView', () => {
  it('\\Sent 属性', () => {
    expect(isSentMailboxView(mb({ attributes: ['\\Sent'] }))).toBe(true)
  })
  it('path 包含 sent', () => {
    expect(isSentMailboxView(mb({ path: 'Sent Messages' }))).toBe(true)
  })
  it('非 sent', () => {
    expect(isSentMailboxView(mb({ path: 'INBOX' }))).toBe(false)
  })
})

describe('isJunkMailboxView', () => {
  it('\\Junk 属性', () => {
    expect(isJunkMailboxView(mb({ attributes: ['\\Junk'] }))).toBe(true)
  })
  it('\\Spam 属性', () => {
    expect(isJunkMailboxView(mb({ attributes: ['\\Spam'] }))).toBe(true)
  })
  it('path 包含 junk', () => {
    expect(isJunkMailboxView(mb({ path: 'Junk' }))).toBe(true)
  })
  it('name 包含 垃圾', () => {
    expect(isJunkMailboxView(mb({ name: '垃圾邮件' }))).toBe(true)
  })
  it('非 junk', () => {
    expect(isJunkMailboxView(mb({ path: 'INBOX' }))).toBe(false)
  })
})

describe('isTrashMailboxView', () => {
  it('\\Trash 属性', () => {
    expect(isTrashMailboxView(mb({ attributes: ['\\Trash'] }))).toBe(true)
  })
  it('path 包含 trash', () => {
    expect(isTrashMailboxView(mb({ path: 'Trash' }))).toBe(true)
  })
  it('path 包含 deleted', () => {
    expect(isTrashMailboxView(mb({ path: 'Deleted Items' }))).toBe(true)
  })
  it('name 包含 删除', () => {
    expect(isTrashMailboxView(mb({ name: '已删除' }))).toBe(true)
  })
  it('非 trash', () => {
    expect(isTrashMailboxView(mb({ path: 'INBOX' }))).toBe(false)
  })
})

describe('isFlaggedMailboxView', () => {
  it('\\Flagged 属性', () => {
    expect(isFlaggedMailboxView(mb({ attributes: ['\\Flagged'] }))).toBe(true)
  })
  it('path 包含 star', () => {
    expect(isFlaggedMailboxView(mb({ path: 'Starred' }))).toBe(true)
  })
  it('path 包含 important', () => {
    expect(isFlaggedMailboxView(mb({ path: 'Important' }))).toBe(true)
  })
  it('name 包含 收藏', () => {
    expect(isFlaggedMailboxView(mb({ name: '收藏' }))).toBe(true)
  })
  it('非 flagged', () => {
    expect(isFlaggedMailboxView(mb({ path: 'INBOX' }))).toBe(false)
  })
})

describe('isMailboxSelectable', () => {
  it('无 \\Noselect 属性 → 可选', () => {
    expect(isMailboxSelectable(mb({ attributes: ['\\HasChildren'] }))).toBe(true)
  })
  it('有 \\Noselect 属性 → 不可选', () => {
    expect(isMailboxSelectable(mb({ attributes: ['\\Noselect'] }))).toBe(false)
  })
})

// ── getMailboxLabel ──
describe('getMailboxLabel', () => {
  it('INBOX → 收件箱', () => {
    expect(getMailboxLabel(mb({ path: 'INBOX' }))).toBe('收件箱')
  })
  it('\\Drafts → 草稿', () => {
    expect(getMailboxLabel(mb({ attributes: ['\\Drafts'] }))).toBe('草稿')
  })
  it('\\Sent → 已发送', () => {
    expect(getMailboxLabel(mb({ attributes: ['\\Sent'] }))).toBe('已发送')
  })
  it('\\Junk → 垃圾邮件', () => {
    expect(getMailboxLabel(mb({ attributes: ['\\Junk'] }))).toBe('垃圾邮件')
  })
  it('\\Trash → 已删除', () => {
    expect(getMailboxLabel(mb({ attributes: ['\\Trash'] }))).toBe('已删除')
  })
  it('未知邮箱 → 使用 name', () => {
    expect(getMailboxLabel(mb({ path: 'Custom', name: 'My Folder' }))).toBe('My Folder')
  })
  it('未知邮箱无 name → 使用 path', () => {
    expect(getMailboxLabel(mb({ path: 'Custom' }))).toBe('Custom')
  })
})

// ── resolveMailboxIcon ──
describe('resolveMailboxIcon', () => {
  it('INBOX 返回 Inbox 图标', () => {
    const icon = resolveMailboxIcon(mb({ path: 'INBOX' }))
    expect(icon.displayName).toBe('Inbox')
  })
  it('Junk 返回 Ban 图标', () => {
    const icon = resolveMailboxIcon(mb({ attributes: ['\\Junk'] }))
    expect(icon.displayName).toBe('Ban')
  })
  it('Trash 返回 Trash2 图标', () => {
    const icon = resolveMailboxIcon(mb({ attributes: ['\\Trash'] }))
    expect(icon.displayName).toBe('Trash2')
  })
  it('Sent 返回 Send 图标', () => {
    const icon = resolveMailboxIcon(mb({ attributes: ['\\Sent'] }))
    expect(icon.displayName).toBe('Send')
  })
  it('Archive 返回 Archive 图标', () => {
    const icon = resolveMailboxIcon(mb({ path: 'Archive' }))
    expect(icon.displayName).toBe('Archive')
  })
  it('未知返回 Mail 图标', () => {
    const icon = resolveMailboxIcon(mb({ path: 'Custom' }))
    expect(icon.displayName).toBe('Mail')
  })
})

// ── buildForwardSubject ──
describe('buildForwardSubject', () => {
  it('普通主题添加 Fwd: 前缀', () => {
    expect(buildForwardSubject('Hello World')).toBe('Fwd: Hello World')
  })
  it('已有 Fwd: 前缀不重复添加', () => {
    expect(buildForwardSubject('Fwd: Hello')).toBe('Fwd: Hello')
  })
  it('大小写不敏感的 fwd:', () => {
    expect(buildForwardSubject('FWD: Test')).toBe('FWD: Test')
  })
  it('空主题', () => {
    expect(buildForwardSubject('')).toBe('Fwd: （无主题）')
  })
  it('空格主题', () => {
    expect(buildForwardSubject('   ')).toBe('Fwd: （无主题）')
  })
})

// ── buildForwardBody ──
describe('buildForwardBody', () => {
  it('包含转发头部信息', () => {
    const body = buildForwardBody({
      from: 'alice@test.com',
      to: 'bob@test.com',
      cc: '',
      time: '2026-01-15',
      subject: 'Test',
      bodyText: 'Original content',
    })
    expect(body).toContain('---------- 转发邮件 ----------')
    expect(body).toContain('发件人: alice@test.com')
    expect(body).toContain('收件人: bob@test.com')
    expect(body).toContain('主题: Test')
    expect(body).toContain('Original content')
  })
  it('有 cc 时包含抄送行', () => {
    const body = buildForwardBody({
      from: 'a@t.com',
      to: 'b@t.com',
      cc: 'c@t.com',
      time: '',
      subject: '',
      bodyText: '',
    })
    expect(body).toContain('抄送: c@t.com')
  })
  it('无 cc 时不包含抄送行', () => {
    const body = buildForwardBody({
      from: 'a@t.com',
      to: 'b@t.com',
      cc: '',
      time: '',
      subject: '',
      bodyText: '',
    })
    expect(body).not.toContain('抄送')
  })
  it('空字段使用 — 占位', () => {
    const body = buildForwardBody({
      from: '',
      to: '',
      cc: '',
      time: '',
      subject: '',
      bodyText: '',
    })
    expect(body).toContain('发件人: —')
    expect(body).toContain('日期: —')
    expect(body).toContain('主题: —')
    expect(body).toContain('收件人: —')
  })
})

// ── buildMailboxTree ──
describe('buildMailboxTree', () => {
  it('扁平列表构建树', () => {
    const mailboxes: EmailMailboxView[] = [
      { path: 'INBOX', name: 'Inbox', attributes: [], sort: 1 },
      { path: 'Work', name: 'Work', attributes: [], sort: 2 },
    ]
    const tree = buildMailboxTree(mailboxes)
    expect(tree).toHaveLength(2)
    expect(tree[0]!.path).toBe('INBOX')
    expect(tree[1]!.path).toBe('Work')
  })
  it('父子关系', () => {
    const mailboxes: EmailMailboxView[] = [
      { path: 'Work', name: 'Work', attributes: [], sort: 1 },
      { path: 'Work/Projects', name: 'Projects', parentPath: 'Work', attributes: [], sort: 1 },
    ]
    const tree = buildMailboxTree(mailboxes)
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children).toHaveLength(1)
    expect(tree[0]!.children[0]!.path).toBe('Work/Projects')
  })
  it('多层嵌套', () => {
    const mailboxes: EmailMailboxView[] = [
      { path: 'A', name: 'A', attributes: [] },
      { path: 'A/B', name: 'B', parentPath: 'A', attributes: [] },
      { path: 'A/B/C', name: 'C', parentPath: 'A/B', attributes: [] },
    ]
    const tree = buildMailboxTree(mailboxes)
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children[0]!.children[0]!.path).toBe('A/B/C')
  })
  it('空列表', () => {
    expect(buildMailboxTree([])).toEqual([])
  })
  it('孤儿节点（parentPath 不存在）提升为根', () => {
    const mailboxes: EmailMailboxView[] = [
      { path: 'Child', name: 'Child', parentPath: 'NonExistent', attributes: [] },
    ]
    const tree = buildMailboxTree(mailboxes)
    expect(tree).toHaveLength(1)
    expect(tree[0]!.path).toBe('Child')
  })
  it('按 sort 排序', () => {
    const mailboxes: EmailMailboxView[] = [
      { path: 'B', name: 'B', attributes: [], sort: 2 },
      { path: 'A', name: 'A', attributes: [], sort: 1 },
      { path: 'C', name: 'C', attributes: [], sort: 3 },
    ]
    const tree = buildMailboxTree(mailboxes)
    expect(tree.map((n) => n.path)).toEqual(['A', 'B', 'C'])
  })
  it('sort 相同时按 path 字母排序', () => {
    const mailboxes: EmailMailboxView[] = [
      { path: 'Zebra', name: 'Zebra', attributes: [] },
      { path: 'Alpha', name: 'Alpha', attributes: [] },
    ]
    const tree = buildMailboxTree(mailboxes)
    expect(tree[0]!.path).toBe('Alpha')
    expect(tree[1]!.path).toBe('Zebra')
  })
})

// ── moveItem ──
describe('moveItem', () => {
  it('向后移动', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })
  it('向前移动', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('同位置不变', () => {
    const items = ['a', 'b', 'c']
    expect(moveItem(items, 1, 1)).toBe(items)
  })
  it('无效 fromIndex 返回原数组', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 5, 0)).toBe(items)
  })
})
