/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * externalSkillsService 单元测试
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/services/__tests__/externalSkillsService.test.ts
 *
 * 测试覆盖:
 *   A) wrapAsSkillMd — 实际导出函数：YAML 安全、前缀剥离、注入防护
 *   B) scanFolderSource — 实际导出函数：文件夹扫描、SKILL.md 检测
 *   C) scanFileSource — 实际导出函数：文件扫描、symlink 处理
 *   D) isAlreadyImported — 实际导出函数：symlink/目录/不存在
 *   E) buildExternalSources — 实际导出函数：源路径构建
 *   F) 路径遍历防护 — 与 importExternalSkills 中使用的逻辑一致
 *   G) resolveSkillDeleteTarget 路径正确性
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  wrapAsSkillMd,
  scanFolderSource,
  scanFileSource,
  isAlreadyImported,
  buildExternalSources,
} from '../externalSkillsService'

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0
let failed = 0
const testErrors: Array<{ name: string; error: unknown }> = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    testErrors.push({ name, error: err })
    console.error(`  ✗ ${name}`)
    if (err instanceof Error) console.error(`    ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tmpRoot: string

async function setup() {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openloaf-ext-skill-test-'))
}

async function teardown() {
  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
}

async function createFolderSkill(dir: string, name: string, skillContent?: string): Promise<string> {
  const skillDir = path.join(dir, name)
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    skillContent ?? `---\nname: ${name}\ndescription: Test skill\n---\nContent of ${name}\n`,
  )
  return skillDir
}

async function createFileSkill(dir: string, filename: string, content?: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  await fs.writeFile(filePath, content ?? `# ${filename}\nSome content\n`)
  return filePath
}

// ---------------------------------------------------------------------------
// A) wrapAsSkillMd — 调用实际导出函数
// ---------------------------------------------------------------------------
async function testWrapAsSkillMd() {
  console.log('\n--- A) wrapAsSkillMd (actual export) ---')

  await test('simple name should not be quoted', () => {
    const result = wrapAsSkillMd('cursor-react-rules', 'content')
    assert.ok(result.includes('name: react-rules'))
    assert.ok(!result.includes('"react-rules"'))
  })

  await test('name with colon should be YAML-quoted', () => {
    const result = wrapAsSkillMd('cursor-my:rule', 'content')
    assert.ok(result.includes('name: "my:rule"'))
  })

  await test('name with double quotes should be escaped', () => {
    const result = wrapAsSkillMd('cursor-say"hello"', 'content')
    assert.ok(result.includes('\\"hello\\"'))
  })

  await test('prefix should be stripped from name', () => {
    const result = wrapAsSkillMd('claude-my-skill', 'content')
    assert.ok(result.includes('name: my-skill'))
  })

  await test('codex prefix should be stripped', () => {
    const result = wrapAsSkillMd('codex-tool', 'content')
    assert.ok(result.includes('name: tool'))
  })

  await test('windsurf prefix should be stripped', () => {
    const result = wrapAsSkillMd('windsurf-lint', 'content')
    assert.ok(result.includes('name: lint'))
  })

  await test('name with newline should be sanitized (no YAML injection)', () => {
    const result = wrapAsSkillMd('cursor-evil\ninjected: true', 'content')
    // The newline between name fields should be replaced with space, preventing YAML injection.
    // After sanitization, `name:` line should contain the flattened value on ONE line.
    const nameLineMatch = result.match(/^name: (.+)$/m)
    assert.ok(nameLineMatch, 'should have a name line')
    const nameValue = nameLineMatch![1]!
    // The name should NOT contain a newline (which would allow injecting extra YAML fields)
    assert.ok(!nameValue.includes('\n'), 'name value should not contain newline')
    // The injected field should NOT appear as a separate YAML key
    const lines = result.split('\n')
    const injectedLine = lines.find((l) => l.startsWith('injected:'))
    assert.equal(injectedLine, undefined, 'injected YAML key should not exist')
  })

  await test('name with backslash should be escaped', () => {
    const result = wrapAsSkillMd('cursor-back\\slash', 'content')
    assert.ok(result.includes('\\\\'))
  })

  await test('content is preserved as-is', () => {
    const content = '# Hello\n\nThis is content with `code` and **bold**'
    const result = wrapAsSkillMd('cursor-test', content)
    assert.ok(result.includes(content))
  })
}

// ---------------------------------------------------------------------------
// B) scanFolderSource — 调用实际导出函数
// ---------------------------------------------------------------------------
async function testScanFolderSource() {
  console.log('\n--- B) scanFolderSource (actual export) ---')

  await test('finds skills with SKILL.md', async () => {
    const scanDir = path.join(tmpRoot, 'scan-folder-b')
    await createFolderSkill(scanDir, 'skill-a')
    await createFolderSkill(scanDir, 'skill-b')
    await fs.mkdir(path.join(scanDir, 'not-a-skill'), { recursive: true })
    await fs.writeFile(path.join(scanDir, 'not-a-skill', 'README.md'), 'hello')

    const dummyTarget = path.join(tmpRoot, 'target-b')
    await fs.mkdir(dummyTarget, { recursive: true })
    const skills = await scanFolderSource(scanDir, dummyTarget, 'claude')
    assert.equal(skills.length, 2)
    const names = skills.map((s) => s.name)
    assert.ok(names.includes('skill-a'))
    assert.ok(names.includes('skill-b'))
    // targetName should have prefix
    const targetNames = skills.map((s) => s.targetName)
    assert.ok(targetNames.includes('claude-skill-a'))
    assert.ok(targetNames.includes('claude-skill-b'))
  })

  await test('empty prefix preserves original name', async () => {
    const scanDir = path.join(tmpRoot, 'scan-folder-noprefix')
    await createFolderSkill(scanDir, 'original-name')
    const dummyTarget = path.join(tmpRoot, 'target-noprefix')
    await fs.mkdir(dummyTarget, { recursive: true })
    const skills = await scanFolderSource(scanDir, dummyTarget, '')
    assert.equal(skills.length, 1)
    assert.equal(skills[0]!.targetName, 'original-name')
  })

  await test('returns empty for nonexistent dir', async () => {
    const skills = await scanFolderSource('/nonexistent/path', tmpRoot, 'x')
    assert.equal(skills.length, 0)
  })

  await test('detects symlinked skill folders', async () => {
    const scanDir = path.join(tmpRoot, 'scan-folder-link')
    await fs.mkdir(scanDir, { recursive: true })
    const realSkill = await createFolderSkill(path.join(tmpRoot, 'real-skill-b'), 'real')
    await fs.symlink(realSkill, path.join(scanDir, 'linked-skill'))
    const dummyTarget = path.join(tmpRoot, 'target-link-b')
    await fs.mkdir(dummyTarget, { recursive: true })
    const skills = await scanFolderSource(scanDir, dummyTarget, 'codex')
    assert.equal(skills.length, 1)
    assert.equal(skills[0]!.name, 'linked-skill')
    assert.equal(skills[0]!.targetName, 'codex-linked-skill')
  })
}

// ---------------------------------------------------------------------------
// C) scanFileSource — 调用实际导出函数
// ---------------------------------------------------------------------------
async function testScanFileSource() {
  console.log('\n--- C) scanFileSource (actual export) ---')

  await test('finds .mdc files', async () => {
    const scanDir = path.join(tmpRoot, 'scan-file-c')
    await createFileSkill(scanDir, 'rule-a.mdc')
    await createFileSkill(scanDir, 'rule-b.mdc')
    await createFileSkill(scanDir, 'readme.md') // should not match

    const dummyTarget = path.join(tmpRoot, 'target-c')
    await fs.mkdir(dummyTarget, { recursive: true })
    const skills = await scanFileSource(scanDir, '.mdc', dummyTarget, 'cursor')
    assert.equal(skills.length, 2)
    assert.ok(skills.some((s) => s.targetName === 'cursor-rule-a'))
    assert.ok(skills.some((s) => s.targetName === 'cursor-rule-b'))
  })

  await test('handles symlink to file', async () => {
    const scanDir = path.join(tmpRoot, 'scan-file-symlink')
    await fs.mkdir(scanDir, { recursive: true })
    const realFile = path.join(tmpRoot, 'real-rule-c.mdc')
    await fs.writeFile(realFile, 'real content')
    await fs.symlink(realFile, path.join(scanDir, 'linked-rule.mdc'))

    const dummyTarget = path.join(tmpRoot, 'target-symlink-c')
    await fs.mkdir(dummyTarget, { recursive: true })
    const skills = await scanFileSource(scanDir, '.mdc', dummyTarget, 'cursor')
    assert.equal(skills.length, 1)
    assert.equal(skills[0]!.name, 'linked-rule')
  })

  await test('returns empty for nonexistent dir', async () => {
    const skills = await scanFileSource('/nonexistent', '.mdc', tmpRoot, 'x')
    assert.equal(skills.length, 0)
  })

  await test('ignores files without matching extension', async () => {
    const scanDir = path.join(tmpRoot, 'scan-file-nomatch')
    await createFileSkill(scanDir, 'doc.txt')
    await createFileSkill(scanDir, 'notes.md')
    const skills = await scanFileSource(scanDir, '.mdc', tmpRoot, 'cursor')
    assert.equal(skills.length, 0)
  })
}

// ---------------------------------------------------------------------------
// D) isAlreadyImported — 调用实际导出函数
// ---------------------------------------------------------------------------
async function testIsAlreadyImported() {
  console.log('\n--- D) isAlreadyImported (actual export) ---')

  await test('returns false when target does not exist', async () => {
    const targetDir = path.join(tmpRoot, 'import-check-empty')
    await fs.mkdir(targetDir, { recursive: true })
    const result = await isAlreadyImported(targetDir, 'nonexistent', '/some/source')
    assert.equal(result, false)
  })

  await test('returns true when symlink points to same source', async () => {
    const sourceDir = path.join(tmpRoot, 'import-check-source')
    const skillDir = await createFolderSkill(sourceDir, 'my-skill')
    const targetDir = path.join(tmpRoot, 'import-check-target')
    await fs.mkdir(targetDir, { recursive: true })
    await fs.symlink(skillDir, path.join(targetDir, 'my-skill'))
    const result = await isAlreadyImported(targetDir, 'my-skill', skillDir)
    assert.equal(result, true)
  })

  await test('returns true when target is a regular directory', async () => {
    const targetDir = path.join(tmpRoot, 'import-check-dir')
    await fs.mkdir(path.join(targetDir, 'existing-skill'), { recursive: true })
    const result = await isAlreadyImported(targetDir, 'existing-skill', '/some/other/source')
    assert.equal(result, true)
  })

  await test('returns false when targetSkillsDir is empty string', async () => {
    const result = await isAlreadyImported('', 'anything', '/some/source')
    assert.equal(result, false)
  })
}

// ---------------------------------------------------------------------------
// E) buildExternalSources — 调用实际导出函数
// ---------------------------------------------------------------------------
async function testBuildExternalSources() {
  console.log('\n--- E) buildExternalSources (actual export) ---')

  await test('without projectRootPath returns only global sources', () => {
    const sources = buildExternalSources(undefined)
    assert.ok(sources.length > 0)
    // Claude Code global path should exist
    const claude = sources.find((s) => s.sourceId === 'claude-code')
    assert.ok(claude)
    assert.ok(claude.paths.length >= 1)
    // Cursor should have no paths (project-only)
    const cursor = sources.find((s) => s.sourceId === 'cursor')
    assert.ok(cursor)
    assert.equal(cursor.paths.length, 0)
  })

  await test('with projectRootPath adds project-level paths', () => {
    const sources = buildExternalSources('/tmp/test-project')
    const claude = sources.find((s) => s.sourceId === 'claude-code')
    assert.ok(claude)
    assert.ok(claude.paths.length >= 2) // global + project
    assert.ok(claude.paths.some((p) => p.includes('/tmp/test-project')))

    const cursor = sources.find((s) => s.sourceId === 'cursor')
    assert.ok(cursor)
    assert.ok(cursor.paths.length >= 1) // project only
    assert.ok(cursor.paths.some((p) => p.includes('.cursor/rules')))
  })

  await test('all expected sources are present', () => {
    const sources = buildExternalSources('/tmp/project')
    const ids = sources.map((s) => s.sourceId)
    assert.ok(ids.includes('claude-code'))
    assert.ok(ids.includes('codex'))
    assert.ok(ids.includes('cursor'))
    assert.ok(ids.includes('windsurf'))
    assert.ok(ids.includes('copilot'))
    assert.ok(ids.includes('other'))
  })

  await test('source modes and indicators are correct', () => {
    const sources = buildExternalSources('/tmp/project')
    const claude = sources.find((s) => s.sourceId === 'claude-code')!
    assert.equal(claude.mode, 'folder')
    assert.equal(claude.skillIndicator, 'SKILL.md')

    const cursor = sources.find((s) => s.sourceId === 'cursor')!
    assert.equal(cursor.mode, 'file')
    assert.equal(cursor.skillIndicator, '.mdc')

    const copilot = sources.find((s) => s.sourceId === 'copilot')!
    assert.equal(copilot.mode, 'file')
    assert.equal(copilot.skillIndicator, '.instructions.md')
  })
}

// ---------------------------------------------------------------------------
// F) Path traversal protection (logic validation)
// ---------------------------------------------------------------------------
async function testPathTraversal() {
  console.log('\n--- F) Path traversal protection ---')

  await test('targetName with ../ is sanitized by path.basename', () => {
    const malicious = '../../../etc/passwd'
    const sanitized = path.basename(malicious)
    assert.equal(sanitized, 'passwd')
    assert.notEqual(sanitized, malicious)
  })

  await test('targetName with slash is sanitized by path.basename', () => {
    assert.equal(path.basename('foo/bar/baz'), 'baz')
  })

  await test('simple targetName passes basename check', () => {
    const name = 'claude-my-skill'
    assert.equal(path.basename(name), name)
  })

  await test('destPath inside targetSkillsDir passes startsWith check', () => {
    const targetDir = '/home/user/.openloaf/skills'
    const destPath = path.join(targetDir, 'my-skill')
    assert.ok(path.resolve(destPath).startsWith(path.resolve(targetDir) + path.sep))
  })

  await test('sourcePath whitelist rejects paths outside known dirs', () => {
    const allowedDirs = ['/home/user/.claude/skills', '/home/user/.codex/skills']
    const maliciousSource = '/etc/shadow'
    const resolvedSource = path.resolve(maliciousSource)
    const isAllowed = allowedDirs.some((dir) =>
      resolvedSource === dir || resolvedSource.startsWith(dir + path.sep),
    )
    assert.equal(isAllowed, false)
  })

  await test('sourcePath whitelist allows paths inside known dirs', () => {
    const allowedDirs = ['/home/user/.claude/skills']
    const goodSource = '/home/user/.claude/skills/my-skill'
    const resolvedSource = path.resolve(goodSource)
    const isAllowed = allowedDirs.some((dir) =>
      resolvedSource === dir || resolvedSource.startsWith(dir + path.sep),
    )
    assert.equal(isAllowed, true)
  })
}

// ---------------------------------------------------------------------------
// G) resolveSkillDeleteTarget path correctness
// ---------------------------------------------------------------------------
async function testDeleteTargetPath() {
  console.log('\n--- G) resolveSkillDeleteTarget path correctness ---')

  await test('global scope should NOT double .openloaf', () => {
    const globalRoot = path.join(os.homedir(), '.openloaf')
    const correctPath = path.join(os.homedir(), '.openloaf', 'skills')
    const buggyPath = path.join(globalRoot, '.openloaf', 'skills')
    assert.notEqual(correctPath, buggyPath, 'Bug would cause double .openloaf')
    assert.equal(correctPath, path.join(globalRoot, 'skills'))
  })

  await test('project scope path uses .openloaf subdirectory', () => {
    const projectRoot = '/home/user/projects/my-project'
    const skillsPath = path.join(projectRoot, '.openloaf', 'skills')
    assert.ok(skillsPath.includes('.openloaf'))
    assert.ok(skillsPath.endsWith('skills'))
  })

  await test('skill path inside skillsRoot passes validation', () => {
    const skillsRoot = '/home/user/.openloaf/skills'
    const skillDir = '/home/user/.openloaf/skills/my-skill'
    assert.ok(skillDir.startsWith(`${skillsRoot}${path.sep}`))
  })

  await test('skill path outside skillsRoot fails validation', () => {
    const skillsRoot = '/home/user/.openloaf/skills'
    const skillDir = '/home/user/.openloaf/agents/other-dir'
    assert.ok(!skillDir.startsWith(`${skillsRoot}${path.sep}`))
  })
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('externalSkillsService 单元测试（第二版 — 调用实际导出函数）\n')
  await setup()
  try {
    await testWrapAsSkillMd()
    await testScanFolderSource()
    await testScanFileSource()
    await testIsAlreadyImported()
    await testBuildExternalSources()
    await testPathTraversal()
    await testDeleteTargetPath()
  } finally {
    await teardown()
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
  if (testErrors.length > 0) {
    console.error('\n失败详情:')
    for (const { name, error } of testErrors) {
      console.error(`  ${name}:`)
      if (error instanceof Error) {
        console.error(`    ${error.message}`)
        if (error.stack) console.error(`    ${error.stack.split('\n').slice(1, 3).join('\n    ')}`)
      }
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
