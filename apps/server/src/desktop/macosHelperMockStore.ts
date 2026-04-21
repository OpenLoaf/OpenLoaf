/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * macOS helper mock store — drives the ai-browser-test "macos-control" suite
 * without the Swift binary. The real helper hits the user's actual desktop,
 * so browser tests would be non-deterministic and unsafe to parallelize;
 * mocks let us verify agent behavior (tool selection, observe-act loop,
 * permission flow) in isolation.
 *
 * Activation — set once at startup:
 *   OPENLOAF_MACOS_HELPER_MOCK=1
 *
 * Without the flag the store refuses to set scenarios and `getResponse`
 * returns null so the client falls through to the real helper path. Production
 * bundles ship inert.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { logger } from '@/common/logger'

/**
 * Mock is active when:
 *   - NODE_ENV !== 'production' (dev and test auto-enable so browser-test
 *     doesn't need a server restart to toggle), OR
 *   - explicit OPENLOAF_MACOS_HELPER_MOCK=1 (escape hatch for prod-like builds)
 *
 * Activation only unlocks the `/debug/macos-helper-mock` endpoint and the
 * per-session dispatch switch; mock responses are returned ONLY when a test
 * has explicitly registered a scenario for its sessionId via that endpoint.
 * Regular dev chat sessions keep hitting the real helper.
 */
export function macosHelperMockEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return process.env.OPENLOAF_MACOS_HELPER_MOCK === '1'
  }
  return true
}

type ScenarioMap = Record<string, Record<string, Record<string, unknown>>>

let cachedScenarios: ScenarioMap | null = null
let cacheError: string | null = null

function loadScenarios(): ScenarioMap {
  if (cachedScenarios) return cachedScenarios
  const root = path.resolve(
    process.cwd(),
    '..',
    '..',
    '.agents/skills/ai-browser-test/fixtures/macos-control/scenarios.json',
  )
  if (!existsSync(root)) {
    cacheError = `macos-control scenarios.json not found at ${root}`
    cachedScenarios = {}
    return cachedScenarios
  }
  const parsed = JSON.parse(readFileSync(root, 'utf-8')) as { scenarios?: ScenarioMap }
  cachedScenarios = parsed.scenarios ?? {}
  return cachedScenarios
}

const store = new Map<string, string>()

export function setScenario(sessionId: string, scenario: string) {
  if (!macosHelperMockEnabled()) throw new Error('macos-control mock not enabled')
  const scenarios = loadScenarios()
  if (!scenarios[scenario]) {
    throw new Error(`unknown scenario: ${scenario} (available: ${Object.keys(scenarios).join(', ')})`)
  }
  store.set(sessionId, scenario)
}

export function clearScenario(sessionId: string) {
  store.delete(sessionId)
}

/** True when this session has explicitly registered a mock scenario. */
export function hasMockScenario(sessionId: string | undefined): boolean {
  if (!macosHelperMockEnabled()) return false
  if (!sessionId) return false
  return store.has(sessionId)
}

/**
 * Look up the canned response for (sessionId, op). Returns null when:
 *   - mock not enabled
 *   - no scenario was registered for this session (caller should fall through
 *     to the real helper)
 *
 * When a session HAS a registered scenario but that scenario is missing an
 * op, returns a structured error so the tool surfaces it to the model instead
 * of silently falling through to real hardware.
 */
export function getMockResponse(
  sessionId: string | undefined,
  op: string,
): Record<string, unknown> | null {
  if (!hasMockScenario(sessionId)) return null
  const scenarioName = store.get(sessionId!)!
  const scenarios = loadScenarios()
  const scenario = scenarios[scenarioName]
  if (!scenario) {
    if (cacheError) logger.warn(`[macos-control-mock] ${cacheError}`)
    return { ok: false, error: `mock: scenario '${scenarioName}' not found in scenarios.json` }
  }
  const resp = scenario[op]
  if (!resp) return { ok: false, error: `mock: no response for op=${op} in scenario=${scenarioName}` }
  return resp
}
