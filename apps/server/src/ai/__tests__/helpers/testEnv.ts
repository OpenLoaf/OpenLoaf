/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
import { existsSync, mkdirSync, cpSync, readdirSync } from 'node:fs'
import os from 'node:os'
import { readApiKey } from '@/ai/shared/util'
import { getProviderSettings, type ProviderSettingEntry } from '@/modules/settings/settingsService'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { setRequestContext, setChatModel, setAbortSignal } from '@/ai/shared/context/requestContext'
import { installHttpProxy } from '@/modules/proxy/httpProxy'
import { getOpenLoafRootDir, setOpenLoafRootOverride, setDefaultProjectStorageRootOverride } from '@openloaf/config'
import { setResolvedTempStorageDir } from '@openloaf/api/services/appConfigService'

// 测试环境初始化代理 — 确保 Node.js fetch 走系统代理（undici 不自动识别环境变量）
installHttpProxy()

const ENV_KEY = 'OPENLOAF_TEST_CHAT_MODEL_ID'

export type TestProviderModelConfig = {
  /** Provider entry loaded from providers.json. */
  provider: ProviderSettingEntry
  /** Resolved model id. */
  modelId: string
  /** Provider API base URL. */
  apiUrl: string
  /** Provider API key. */
  apiKey: string
  /** Whether the provider should use Responses API. */
  enableResponsesApi: boolean
}

/**
 * 读取 OPENLOAF_TEST_CHAT_MODEL_ID 环境变量（格式：profileId:modelId）。
 * 未设置时返回 undefined，走 resolveChatModel 自动 fallback。
 */
export function getTestChatModelId(): string | undefined {
  const raw = process.env[ENV_KEY]
  return raw?.trim() || undefined
}

/**
 * 解析测试模型为 LanguageModelV3。
 */
export async function resolveTestModel() {
  const chatModelId = getTestChatModelId()
  return resolveChatModel({ chatModelId, chatModelSource: 'local' })
}

/** Resolve a provider + model pair from the local providers.json file. */
export async function resolveProviderModelConfig(input: {
  modelId: string
  providerId?: string
  providerEntryId?: string
  apiUrlIncludes?: string
}): Promise<TestProviderModelConfig> {
  const modelId = input.modelId.trim()
  const providerId = input.providerId?.trim()
  const providerEntryId = input.providerEntryId?.trim()
  const apiUrlIncludes = input.apiUrlIncludes?.trim().toLowerCase()

  if (!modelId) {
    throw new Error('modelId 不能为空')
  }

  const providers = await getProviderSettings()
  const provider = providers.find((entry) => {
    if (!entry.models[modelId]) return false
    if (providerId && entry.providerId !== providerId) return false
    if (providerEntryId && entry.id !== providerEntryId) return false
    if (apiUrlIncludes && !entry.apiUrl.toLowerCase().includes(apiUrlIncludes)) return false
    return true
  })

  if (!provider) {
    throw new Error(`未在 providers.json 中找到模型配置: ${modelId}`)
  }

  const apiUrl = provider.apiUrl.trim()
  const apiKey = readApiKey(provider.authConfig)
  if (!apiUrl || !apiKey) {
    throw new Error(`模型配置不完整: ${provider.id} 缺少 apiUrl 或 apiKey`)
  }

  return {
    provider,
    modelId,
    apiUrl,
    apiKey,
    // 逻辑：与生产代码保持一致，自定义 provider 默认走 chat，显式开启后才走 responses。
    enableResponsesApi: provider.options?.enableResponsesApi ?? provider.providerId !== 'custom',
  }
}

/** Build a raw Responses API endpoint from a provider base URL. */
export function buildResponsesApiUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/responses`
}

/**
 * 设置最小 RequestContext（sessionId + cookies）。
 */
export function setMinimalRequestContext() {
  setRequestContext({
    sessionId: `test-${Date.now()}`,
    cookies: {},
  })
}

/**
 * 初始化 E2E 测试环境。
 *
 * 两步复制策略：
 * 1. 复制共享基础 fixtures（project-root/.openloaf/tasks、README.md、配置文件）
 * 2. 扫描各域 tests/{domain}/project-root/ 并 overlay（master 项目结构、tools 文档文件等）
 * 3. 叠加各域根级配置 fixture（如 email.json）
 *
 * 合并后的测试项目根目录结构完整，测试行为不受影响。
 */
let e2eTempRoot: string | null = null

export function setupE2eTestEnv(): string {
  if (e2eTempRoot) return e2eTempRoot

  const behaviorDir = path.resolve(import.meta.dirname, '../agent-behavior')
  const fixturesDir = path.join(behaviorDir, 'fixtures')
  const testsDir = path.join(behaviorDir, 'tests')

  if (!existsSync(fixturesDir)) {
    throw new Error(`Fixture 目录不存在: ${fixturesDir}`)
  }

  // 创建临时 root 目录
  const tempRoot = path.join(os.tmpdir(), `openloaf-e2e-${Date.now()}`)
  mkdirSync(tempRoot, { recursive: true })

  const destProjectRoot = path.join(tempRoot, 'project-root')

  // 1. 复制共享基础项目根目录（.openloaf/tasks、README.md 等）
  const sharedProjectRoot = path.join(fixturesDir, 'project-root')
  if (existsSync(sharedProjectRoot)) {
    cpSync(sharedProjectRoot, destProjectRoot, { recursive: true })
  }

  // 2. 扫描 tests/*/project-root/ 并 overlay 到目标根目录
  for (const domain of readdirSync(testsDir)) {
    const domainProjectRoot = path.join(testsDir, domain, 'project-root')
    if (existsSync(domainProjectRoot)) {
      cpSync(domainProjectRoot, destProjectRoot, { recursive: true })
    }

    const domainEmailConfig = path.join(testsDir, domain, 'email.json')
    if (existsSync(domainEmailConfig)) {
      // 逻辑：邮件配置已迁移到全局根目录，测试时直接覆盖 tempRoot/email.json。
      cpSync(domainEmailConfig, path.join(tempRoot, 'email.json'))
    }
  }

  // 复制 settings.json（模型配置等）
  const settingsSrc = path.join(fixturesDir, 'settings.json')
  if (existsSync(settingsSrc)) {
    cpSync(settingsSrc, path.join(tempRoot, 'settings.json'))
  }

  // 复制 providers.json — 优先使用 fixture，fallback 到用户实际配置
  const providersDest = path.join(tempRoot, 'providers.json')
  const fixtureProviders = path.join(fixturesDir, 'providers.json')
  if (existsSync(fixtureProviders)) {
    cpSync(fixtureProviders, providersDest)
  } else {
    const userProviders = path.join(getOpenLoafRootDir(), 'providers.json')
    if (existsSync(userProviders)) {
      cpSync(userProviders, providersDest)
    }
  }

  // 设置 root override — 所有后续的 getOpenLoafRootDir() 都指向临时目录
  setOpenLoafRootOverride(tempRoot)
  // 设置项目存储根 override，确保测试内的项目文件解析到临时项目目录。
  setDefaultProjectStorageRootOverride(destProjectRoot)
  // 把 temp storage 也指向测试临时目录，避免 user-scope 记忆写到 ~/OpenLoafData/memory
  // 污染用户真实记忆（MemorySave scope="user" 默认落盘在 temp storage 下）。
  setResolvedTempStorageDir(tempRoot)
  e2eTempRoot = tempRoot

  return tempRoot
}

export { getProviderSettings, setChatModel, setAbortSignal }
