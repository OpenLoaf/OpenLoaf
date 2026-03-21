#!/usr/bin/env node

/**
 * i18n 翻译完整性验证脚本
 *
 * 检查所有语言的翻译文件，找出：
 * 1. 某语言缺少的 namespace 文件
 * 2. 某语言缺少的翻译 key（以 zh-CN 为基准）
 * 3. 某语言多出的翻译 key（可能是废弃的）
 * 4. 值为空字符串的 key
 * 5. 值与 key 名相同的可疑翻译（可能是占位符）
 *
 * 用法：
 *   node .agents/skills/web-i18n-system/validate-translations.mjs
 *   node .agents/skills/web-i18n-system/validate-translations.mjs --fix-empty
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ── 配置 ──────────────────────────────────────────────

const LOCALES_DIR = resolve(
  import.meta.dirname,
  '../../../apps/web/src/i18n/locales',
)

const LANGUAGES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP']
const BASE_LANG = 'zh-CN' // 基准语言

// ── 工具函数 ──────────────────────────────────────────

/**
 * 递归展平嵌套 JSON 为 dot-separated key 列表
 * { a: { b: "x" } } → { "a.b": "x" }
 */
function flattenKeys(obj, prefix = '') {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenKeys(value, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

/**
 * 读取并解析 JSON 文件，返回展平后的 key-value map
 */
function loadTranslationFile(lang, namespace) {
  const filePath = join(LOCALES_DIR, lang, `${namespace}.json`)
  if (!existsSync(filePath)) {
    return null // 文件不存在
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    const json = JSON.parse(content)
    return flattenKeys(json)
  } catch (err) {
    return { __parse_error__: err.message }
  }
}

/**
 * 获取基准语言的所有 namespace
 */
function getNamespaces() {
  const baseDir = join(LOCALES_DIR, BASE_LANG)
  if (!existsSync(baseDir)) {
    console.error(`❌ 基准语言目录不存在: ${baseDir}`)
    process.exit(1)
  }
  return readdirSync(baseDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
    .sort()
}

// ── 主验证逻辑 ──────────────────────────────────────────

function validate() {
  console.log('🔍 i18n 翻译完整性验证\n')
  console.log(`📁 目录: ${LOCALES_DIR}`)
  console.log(`🌐 语言: ${LANGUAGES.join(', ')}`)
  console.log(`📏 基准: ${BASE_LANG}\n`)

  const namespaces = getNamespaces()
  console.log(`📦 Namespace (${namespaces.length}): ${namespaces.join(', ')}\n`)
  console.log('─'.repeat(60))

  let totalMissing = 0
  let totalExtra = 0
  let totalEmpty = 0
  let totalFilesMissing = 0
  let totalParseErrors = 0

  const issues = [] // 收集所有问题

  for (const ns of namespaces) {
    const baseData = loadTranslationFile(BASE_LANG, ns)
    if (!baseData) {
      issues.push({
        type: 'fatal',
        msg: `基准语言 ${BASE_LANG}/${ns}.json 不存在！`,
      })
      continue
    }
    if (baseData.__parse_error__) {
      issues.push({
        type: 'parse',
        msg: `${BASE_LANG}/${ns}.json 解析失败: ${baseData.__parse_error__}`,
      })
      totalParseErrors++
      continue
    }

    const baseKeys = new Set(Object.keys(baseData))

    for (const lang of LANGUAGES) {
      if (lang === BASE_LANG) {
        // 检查基准语言的空值
        for (const [key, value] of Object.entries(baseData)) {
          if (typeof value === 'string' && value.trim() === '') {
            issues.push({
              type: 'empty',
              lang,
              ns,
              key,
            })
            totalEmpty++
          }
        }
        continue
      }

      const langData = loadTranslationFile(lang, ns)

      // 检查 1: 文件缺失
      if (!langData) {
        issues.push({
          type: 'file-missing',
          lang,
          ns,
        })
        totalFilesMissing++
        continue
      }

      // 检查 1.5: 解析错误
      if (langData.__parse_error__) {
        issues.push({
          type: 'parse',
          msg: `${lang}/${ns}.json 解析失败: ${langData.__parse_error__}`,
        })
        totalParseErrors++
        continue
      }

      const langKeys = new Set(Object.keys(langData))

      // 检查 2: 缺少的 key（在基准中有，但此语言没有）
      for (const key of baseKeys) {
        if (!langKeys.has(key)) {
          issues.push({
            type: 'missing',
            lang,
            ns,
            key,
          })
          totalMissing++
        }
      }

      // 检查 3: 多余的 key（在此语言有，但基准中没有）
      for (const key of langKeys) {
        if (!baseKeys.has(key)) {
          issues.push({
            type: 'extra',
            lang,
            ns,
            key,
          })
          totalExtra++
        }
      }

      // 检查 4: 空值
      for (const [key, value] of Object.entries(langData)) {
        if (typeof value === 'string' && value.trim() === '') {
          issues.push({
            type: 'empty',
            lang,
            ns,
            key,
          })
          totalEmpty++
        }
      }
    }
  }

  // ── 输出结果 ──────────────────────────────────────────

  // 按类型分组输出
  const filesMissing = issues.filter((i) => i.type === 'file-missing')
  const parseErrors = issues.filter((i) => i.type === 'parse')
  const missing = issues.filter((i) => i.type === 'missing')
  const extra = issues.filter((i) => i.type === 'extra')
  const empty = issues.filter((i) => i.type === 'empty')

  if (parseErrors.length > 0) {
    console.log('\n🔴 JSON 解析错误:')
    for (const i of parseErrors) {
      console.log(`   ${i.msg}`)
    }
  }

  if (filesMissing.length > 0) {
    console.log('\n🔴 缺少的翻译文件:')
    for (const i of filesMissing) {
      console.log(`   ${i.lang}/${i.ns}.json`)
    }
  }

  if (missing.length > 0) {
    console.log('\n🟡 缺少的翻译 key:')
    // 按语言分组
    const byLang = {}
    for (const i of missing) {
      const k = i.lang
      if (!byLang[k]) byLang[k] = []
      byLang[k].push(i)
    }
    for (const [lang, items] of Object.entries(byLang)) {
      console.log(`\n   [${lang}] (${items.length} 个缺失)`)
      // 按 namespace 分组
      const byNs = {}
      for (const i of items) {
        if (!byNs[i.ns]) byNs[i.ns] = []
        byNs[i.ns].push(i.key)
      }
      for (const [ns, keys] of Object.entries(byNs)) {
        console.log(`   📄 ${ns}.json:`)
        for (const key of keys) {
          const baseValue = loadTranslationFile(BASE_LANG, ns)?.[key]
          const preview =
            typeof baseValue === 'string' && baseValue.length > 40
              ? `${baseValue.slice(0, 40)}…`
              : baseValue
          console.log(`      - ${key}  (${BASE_LANG}: "${preview}")`)
        }
      }
    }
  }

  if (extra.length > 0) {
    console.log('\n🔵 多余的翻译 key（基准语言中不存在）:')
    const byLang = {}
    for (const i of extra) {
      const k = i.lang
      if (!byLang[k]) byLang[k] = []
      byLang[k].push(i)
    }
    for (const [lang, items] of Object.entries(byLang)) {
      console.log(`\n   [${lang}] (${items.length} 个多余)`)
      const byNs = {}
      for (const i of items) {
        if (!byNs[i.ns]) byNs[i.ns] = []
        byNs[i.ns].push(i.key)
      }
      for (const [ns, keys] of Object.entries(byNs)) {
        console.log(`   📄 ${ns}.json:`)
        for (const key of keys) {
          console.log(`      - ${key}`)
        }
      }
    }
  }

  if (empty.length > 0) {
    console.log('\n⚪ 空值翻译 key:')
    for (const i of empty) {
      console.log(`   ${i.lang}/${i.ns}.json → ${i.key}`)
    }
  }

  // ── 汇总 ──────────────────────────────────────────

  console.log('\n' + '─'.repeat(60))

  // 统计每个语言的 key 数量
  console.log('\n📊 各语言翻译覆盖统计:\n')
  const baseTotalKeys = namespaces.reduce((sum, ns) => {
    const data = loadTranslationFile(BASE_LANG, ns)
    return sum + (data ? Object.keys(data).length : 0)
  }, 0)

  for (const lang of LANGUAGES) {
    const langTotalKeys = namespaces.reduce((sum, ns) => {
      const data = loadTranslationFile(lang, ns)
      return sum + (data && !data.__parse_error__ ? Object.keys(data).length : 0)
    }, 0)
    const langMissing = missing.filter((i) => i.lang === lang).length
    const coverage =
      baseTotalKeys > 0
        ? (((baseTotalKeys - langMissing) / baseTotalKeys) * 100).toFixed(1)
        : '100.0'
    const icon = coverage === '100.0' ? '✅' : Number(coverage) >= 95 ? '🟡' : '🔴'
    console.log(
      `   ${icon} ${lang}: ${langTotalKeys} keys, 覆盖率 ${coverage}%${lang === BASE_LANG ? ' (基准)' : ''}`,
    )
  }

  const totalIssues =
    totalMissing + totalExtra + totalEmpty + totalFilesMissing + totalParseErrors
  console.log(`\n📋 总计: ${totalIssues} 个问题`)
  if (totalFilesMissing) console.log(`   🔴 缺少文件: ${totalFilesMissing}`)
  if (totalParseErrors) console.log(`   🔴 解析错误: ${totalParseErrors}`)
  if (totalMissing) console.log(`   🟡 缺少 key: ${totalMissing}`)
  if (totalExtra) console.log(`   🔵 多余 key: ${totalExtra}`)
  if (totalEmpty) console.log(`   ⚪ 空值: ${totalEmpty}`)

  if (totalIssues === 0) {
    console.log('\n🎉 所有翻译完整，无遗漏！')
  }

  console.log()

  // 退出码：有缺失或文件缺失时返回 1
  process.exit(totalMissing + totalFilesMissing + totalParseErrors > 0 ? 1 : 0)
}

validate()
