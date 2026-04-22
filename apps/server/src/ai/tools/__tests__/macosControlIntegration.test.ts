// @ts-nocheck
/**
 * macOS Control 端到端集成测试
 *
 * 跑真 helper 二进制 + 真 test harness .app，验证 observe / act 协议实际效果：
 * AX 树能读到预置 identifier，act 能改变窗口状态，observe 能观察到变化。
 *
 * 用法（必须在 macOS 上）：
 *   cd apps/desktop && node scripts/buildMacosControlHelper.mjs
 *   cd apps/desktop && node scripts/buildMacosControlTestHarness.mjs
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/macosControlIntegration.test.ts
 *
 * 前置：首次跑会弹权限面板，需授 Screen Recording + Accessibility 给执行
 * 该测试的 Node 进程（或其父终端 App）。授权后重跑即可。
 *
 * 非 darwin 环境直接跳过（exit 0）。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// --- Platform gate ---------------------------------------------------------

if (process.platform !== 'darwin') {
  console.log('skip: macOS only')
  process.exit(0)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../../../..')
const helperBin = path.join(
  repoRoot,
  'apps/desktop/native/macos-control/.build/release/macos-control',
)
const harnessApp = path.join(
  repoRoot,
  'apps/desktop/native/macos-control-test-harness/dist/MacosControlTestHarness.app',
)
const HARNESS_BUNDLE = 'com.openloaf.macos-control-test-harness'
const HARNESS_PROC = 'MacosControlTestHarness'

if (!existsSync(helperBin)) {
  console.error(`missing helper binary: ${helperBin}`)
  console.error('run: cd apps/desktop && node scripts/buildMacosControlHelper.mjs')
  process.exit(2)
}
if (!existsSync(harnessApp)) {
  console.error(`missing harness app: ${harnessApp}`)
  console.error('run: cd apps/desktop && node scripts/buildMacosControlTestHarness.mjs')
  process.exit(2)
}

// --- Minimal JSON-line client (standalone, no server deps) ----------------

type HelperResponse = {
  id: string
  ok: boolean
  error?: string
  permissionsMissing?: string[]
  [key: string]: unknown
}

class Helper {
  private child = spawn(helperBin, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  private buf = ''
  private pending = new Map<string, (r: HelperResponse) => void>()
  private seq = 0

  constructor() {
    this.child.stdout!.setEncoding('utf8')
    this.child.stderr!.setEncoding('utf8')
    this.child.stdout!.on('data', (c: string) => {
      this.buf += c
      let i: number
      while ((i = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, i).trim()
        this.buf = this.buf.slice(i + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line) as HelperResponse
          const cb = this.pending.get(msg.id)
          if (cb) {
            this.pending.delete(msg.id)
            cb(msg)
          }
        } catch {
          /* ignore */
        }
      }
    })
    this.child.stderr!.on('data', (c: string) => process.stderr.write(`[helper] ${c}`))
  }

  request(op: string, payload: Record<string, unknown> = {}, timeoutMs = 15000) {
    const id = `r${++this.seq}`
    const body = JSON.stringify({ id, op, ...payload }) + '\n'
    return new Promise<HelperResponse>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`timeout op=${op}`))
      }, timeoutMs)
      this.pending.set(id, (r) => {
        clearTimeout(t)
        resolve(r)
      })
      this.child.stdin!.write(body)
    })
  }

  kill() {
    try {
      this.child.kill()
    } catch {
      /* noop */
    }
  }
}

// --- Harness lifecycle ----------------------------------------------------

function launchHarness() {
  spawnSync('/usr/bin/open', ['-a', harnessApp], { stdio: 'inherit' })
}

function activateHarness() {
  spawnSync('/usr/bin/osascript', [
    '-e',
    `tell application "${HARNESS_PROC}" to activate`,
  ], { stdio: 'ignore' })
}

function quitHarness() {
  spawnSync('pkill', ['-f', HARNESS_PROC], { stdio: 'ignore' })
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// --- AX tree helpers ------------------------------------------------------

interface AxNode {
  role: string
  title?: string
  value?: string
  identifier?: string
  frame?: { x: number; y: number; w: number; h: number }
  path?: string[]
  children?: AxNode[]
}

function findByIdentifier(tree: AxNode, id: string): AxNode | null {
  if (tree.identifier === id) return tree
  for (const c of tree.children ?? []) {
    const hit = findByIdentifier(c, id)
    if (hit) return hit
  }
  return null
}

function collectText(tree: AxNode, acc: string[] = []): string[] {
  if (tree.value) acc.push(String(tree.value))
  if (tree.title) acc.push(String(tree.title))
  for (const c of tree.children ?? []) collectText(c, acc)
  return acc
}

// --- Test runner ----------------------------------------------------------

let passed = 0
let failed = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    failed++
    errors.push(`${name}: ${e?.message ?? e}`)
    console.log(`  ✗ ${name}: ${e?.message ?? e}`)
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

// --- Main -----------------------------------------------------------------

async function main() {
  console.log('macOS Control Integration Tests')
  console.log('================================')

  const helper = new Helper()

  // Permission preflight — abort early with clear message if not granted.
  const perm = await helper.request('permissions')
  const missing = (perm.missing as string[] | undefined) ?? []
  if (missing.length > 0) {
    console.error(`missing permissions: ${missing.join(', ')}`)
    console.error('Grant Screen Recording + Accessibility to this terminal (or Node), then rerun.')
    helper.kill()
    process.exit(3)
  }

  quitHarness()
  await sleep(300)
  launchHarness()
  // Wait for window to show up — poll observe until AX tree contains our picker.
  let ready = false
  for (let i = 0; i < 30; i++) {
    await sleep(300)
    const obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      maxNodes: 300,
      includeScreenshot: false,
    })
    if (obs.ok && findByIdentifier(obs.tree as AxNode, 'tab-basic')) {
      ready = true
      break
    }
  }
  assert(ready, 'test harness did not become ready within 9s')

  // ----- Scenario: basic (counter) -----
  await test('basic scenario: increment counter via AXPress', async () => {
    const obs1 = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    const btn = findByIdentifier(obs1.tree as AxNode, 'btn-increment')
    assert(btn, 'btn-increment not found')
    assert(btn!.path && btn!.path.length > 0, 'btn-increment missing path')

    for (let i = 0; i < 3; i++) {
      const actRes = await helper.request('act', {
        action: {
          type: 'ax_action',
          ref: { app: HARNESS_BUNDLE, path: btn!.path! },
          action: 'AXPress',
        },
      })
      assert(actRes.ok, `AXPress failed: ${actRes.error}`)
    }

    await sleep(200)
    const obs2 = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    const lbl = findByIdentifier(obs2.tree as AxNode, 'lbl-count')
    assert(lbl, 'lbl-count not found after clicks')
    const text = collectText(lbl!).join(' ')
    assert(/Counter:\s*3/.test(text), `expected counter=3, got: ${text}`)
  })

  // ----- Scenario: form (type + submit) -----
  await test('form scenario: type into fields and submit', async () => {
    // Switch tab
    let obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    const formTab = findByIdentifier(obs.tree as AxNode, 'tab-form')
    assert(formTab, 'tab-form not found')
    await helper.request('act', {
      action: {
        type: 'ax_action',
        ref: { app: HARNESS_BUNDLE, path: formTab!.path! },
        action: 'AXPress',
      },
    })
    await sleep(250)

    obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    const nameField = findByIdentifier(obs.tree as AxNode, 'input-name')
    const emailField = findByIdentifier(obs.tree as AxNode, 'input-email')
    const submit = findByIdentifier(obs.tree as AxNode, 'btn-submit')
    assert(nameField && emailField && submit, 'form nodes missing')

    activateHarness()
    await sleep(200)
    await helper.request('act', {
      action: {
        type: 'click',
        ref: { app: HARNESS_BUNDLE, path: nameField!.path! },
      },
    })
    await sleep(150)
    await helper.request('act', { action: { type: 'type', text: 'Alice' } })
    await sleep(150)

    // Tab to next field — more reliable than click-to-focus for SwiftUI TextFields.
    await helper.request('act', { action: { type: 'key', keys: ['tab'] } })
    await sleep(150)
    await helper.request('act', { action: { type: 'type', text: 'a@b.co' } })
    await sleep(150)

    await helper.request('act', {
      action: {
        type: 'ax_action',
        ref: { app: HARNESS_BUNDLE, path: submit!.path! },
        action: 'AXPress',
      },
    })
    await sleep(200)

    obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    const submitted = findByIdentifier(obs.tree as AxNode, 'lbl-submitted')
    assert(submitted, 'lbl-submitted not found')
    const text = collectText(submitted!).join(' ')
    assert(
      text.includes('Alice') && text.includes('a@b.co'),
      `expected submission echo, got: ${text}`,
    )
  })

  // ----- Screenshot: per-window capture works -----
  await test('observe: per-window screenshot + kind=window', async () => {
    const obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: true,
    })
    assert(obs.ok, `observe failed: ${obs.error}`)
    assert(
      obs.screenshotKind === 'window',
      `expected screenshotKind=window, got ${obs.screenshotKind}`,
    )
    assert(
      typeof obs.screenshotWidth === 'number' && (obs.screenshotWidth as number) > 0,
      'screenshot width missing',
    )
    assert(existsSync(String(obs.screenshotPath)), 'screenshot file not written')
  })

  // ----- Cleanup -----
  quitHarness()
  helper.kill()

  console.log('================================')
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const e of errors) console.log('  - ' + e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  quitHarness()
  process.exit(1)
})
