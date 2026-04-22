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
  await test('observe: per-window screenshot + kind=window + screenshotFrame', async () => {
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

    // V2: helper must report the captured region in logical-screen coords so
    // server-side px→screen conversion has an authoritative source.
    const frame = obs.screenshotFrame as
      | { x: number; y: number; w: number; h: number }
      | undefined
    assert(
      frame && typeof frame.x === 'number' && typeof frame.y === 'number' &&
        frame.w > 0 && frame.h > 0,
      `screenshotFrame missing or invalid: ${JSON.stringify(frame)}`,
    )
    // AX window root frame should agree with helper's screenshotFrame (within
    // a few pixels — AX and SCK round differently).
    const treeRoot = obs.tree as AxNode
    let axWinFrame: { x: number; y: number; w: number; h: number } | undefined
    for (const c of treeRoot.children ?? []) {
      if (c.role === 'AXWindow' && c.frame) {
        axWinFrame = c.frame
        break
      }
    }
    if (axWinFrame) {
      const dx = Math.abs(axWinFrame.x - frame!.x)
      const dy = Math.abs(axWinFrame.y - frame!.y)
      assert(
        dx <= 4 && dy <= 4,
        `screenshotFrame (${frame!.x},${frame!.y}) diverges from AX window frame (${axWinFrame.x},${axWinFrame.y}) — origin must be authoritative`,
      )
    }
  })

  // ----- V2 coord conversion: screenshot-pixel click hits the right button -----
  // This is the regression test for the WeChat-avatar bug: the model reports
  // a pixel from the screenshot, the server must convert it to a screen coord
  // that lands on the intended element. We don't run the server tool here —
  // we replicate its math (screenshotPointToScreen) against the helper's
  // authoritative frame, click via helper, and verify the counter advanced.
  await test('v2 coord conversion: click by screenshot-pixel hits btn-increment', async () => {
    // Prior tests may have switched to another tab — ensure we're on basic.
    let obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    const basicTab = findByIdentifier(obs.tree as AxNode, 'tab-basic')
    assert(basicTab, 'tab-basic not found')
    await helper.request('act', {
      action: {
        type: 'ax_action',
        ref: { app: HARNESS_BUNDLE, path: basicTab!.path! },
        action: 'AXPress',
      },
    })
    await sleep(250)

    obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    // Reset counter to 0 via AXPress-reset so the test is deterministic.
    const resetBtn = findByIdentifier(obs.tree as AxNode, 'btn-reset')
    assert(resetBtn, 'btn-reset not found')
    await helper.request('act', {
      action: {
        type: 'ax_action',
        ref: { app: HARNESS_BUNDLE, path: resetBtn!.path! },
        action: 'AXPress',
      },
    })
    await sleep(200)

    // Activate the harness so click goes to the right window.
    activateHarness()
    await sleep(200)

    // Observe with screenshot to pick up screenshotFrame + pixel dims.
    obs = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: true,
    })
    assert(obs.ok, `observe failed: ${obs.error}`)
    const frame = obs.screenshotFrame as { x: number; y: number; w: number; h: number }
    const presentedW = obs.screenshotWidth as number
    const presentedH = obs.screenshotHeight as number
    assert(frame && presentedW > 0 && presentedH > 0, 'screenshotFrame/dims missing')

    const btn = findByIdentifier(obs.tree as AxNode, 'btn-increment')
    assert(btn && btn.frame, 'btn-increment frame missing from AX tree')
    const btnCenterScreen = {
      x: btn!.frame!.x + btn!.frame!.w / 2,
      y: btn!.frame!.y + btn!.frame!.h / 2,
    }

    // Inverse of the server's screenshotPointToScreen: given a screen point,
    // what pixel would the model see? This is what the model would derive by
    // "eyeballing" the screenshot at the button's position.
    const pixelX = ((btnCenterScreen.x - frame.x) * presentedW) / frame.w
    const pixelY = ((btnCenterScreen.y - frame.y) * presentedH) / frame.h

    // Forward conversion (same math as server's screenshotPointToScreen).
    // A correct implementation round-trips back to btnCenterScreen.
    const screenX = Math.round(frame.x + pixelX * (frame.w / presentedW))
    const screenY = Math.round(frame.y + pixelY * (frame.h / presentedH))
    const roundTripDx = Math.abs(screenX - btnCenterScreen.x)
    const roundTripDy = Math.abs(screenY - btnCenterScreen.y)
    assert(
      roundTripDx <= 2 && roundTripDy <= 2,
      `round-trip coord conversion drifted: pixel=(${pixelX.toFixed(1)},${pixelY.toFixed(1)}) screen=(${screenX},${screenY}) expected~(${btnCenterScreen.x},${btnCenterScreen.y})`,
    )

    // Actually click at the converted screen coord and verify the click
    // landed on btn-increment (counter goes from 0 → 1).
    const actRes = await helper.request('act', {
      action: { type: 'click', point: { x: screenX, y: screenY } },
    })
    assert(actRes.ok, `click failed: ${actRes.error}`)
    await sleep(250)

    const obs2 = await helper.request('observe', {
      appFilter: HARNESS_BUNDLE,
      includeScreenshot: false,
    })
    const lbl = findByIdentifier(obs2.tree as AxNode, 'lbl-count')
    assert(lbl, 'lbl-count missing after click')
    const text = collectText(lbl!).join(' ')
    assert(
      /Counter:\s*1/.test(text),
      `pixel-derived click did not hit btn-increment (counter text: ${text})`,
    )
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
