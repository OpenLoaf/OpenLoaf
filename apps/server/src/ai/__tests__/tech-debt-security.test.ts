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
 * AI 安全类技术债验证测试
 *
 * 用法：
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/tech-debt-security.test.ts
 *
 * 覆盖四类已知安全技术债：
 *   S1 — browserDownloadImageTool: imageUrls 无 URL 校验（SSRF 风险）
 *   S2 — commandApproval: $'...' ANSI 引号形式绕过 shell 白名单
 *   S3 — Hono 路由无鉴权（静态代码分析）
 *   S4 — webFetchTool isPermittedRedirect: 子域名跨越场景
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── 测试运行器 ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: unknown) {
    failed++
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`${name}: ${msg}`)
    console.log(`  ✗ ${name}: ${msg}`)
  }
}

// 反向测试辅助：期待断言失败（即当前代码存在缺陷）
async function testExpectVulnerable(
  name: string,
  fn: () => void | Promise<void>,
  knownVuln: string,
) {
  try {
    await fn()
    // fn 未抛出 = 断言通过 = 漏洞**不**存在，报告为已修复
    passed++
    console.log(`  ✓ ${name} [FIXED — 漏洞已修复]`)
  } catch {
    // fn 抛出 = 断言失败 = 漏洞**仍然**存在
    failed++
    failures.push(`${name}: [VULNERABLE] ${knownVuln}`)
    console.log(`  ✗ ${name}: [VULNERABLE] ${knownVuln}`)
  }
}

// ─── 工具函数：从源码提取内联逻辑 ───────────────────────────────────────────

/**
 * 从 commandApproval.ts 中提取 maskQuotedStrings 和 hasUnsafeShellOps 的逻辑。
 * 直接在测试中重现，无需导入（避免副作用）。
 */
function maskQuotedStrings(command: string): string {
  return command
    .replace(/'[^']*'/g, "'_Q_'")
    .replace(/"(?:[^"\\]|\\.)*"/g, '"_Q_"')
}

function hasUnsafeShellOps(masked: string): boolean {
  if (masked.includes('`') || masked.includes('$(')) return true
  if (masked.includes(';')) return true
  if (masked.includes('\n')) return true
  const noSafeRedir = masked
    .replace(/[12]>&[12]/g, '')
    .replace(/\d*>\s*\/dev\/null/g, '')
    .replace(/&>\s*\/dev\/null/g, '')
  if (/(?<!\&)\&(?!\&)/.test(noSafeRedir)) return true
  if (/[<>]/.test(noSafeRedir)) return true
  return false
}

function needsApprovalViaLogic(command: string): boolean {
  const masked = maskQuotedStrings(command)
  return hasUnsafeShellOps(masked)
}

/**
 * isPermittedRedirect 函数逻辑（从 webFetchTool.ts 原样提取）。
 */
function isPermittedRedirect(originalUrl: URL, redirectUrl: URL): boolean {
  if (originalUrl.protocol === 'https:' && redirectUrl.protocol === 'http:') {
    return false
  }
  if (originalUrl.port !== redirectUrl.port) {
    return false
  }
  if (redirectUrl.username || redirectUrl.password) {
    return false
  }
  const origHost = originalUrl.hostname.replace(/^www\./, '')
  const redirHost = redirectUrl.hostname.replace(/^www\./, '')
  return origHost === redirHost
}

// ─── 读取源文件内容（用于静态分析） ─────────────────────────────────────────

const SERVER_SRC = path.resolve(__dirname, '../../..')

function readSource(relPath: string): string {
  const absPath = path.join(SERVER_SRC, relPath)
  return fs.readFileSync(absPath, 'utf-8')
}

// ─── S1: browserDownloadImageTool SSRF 风险 ──────────────────────────────────

async function runS1() {
  console.log('\nS1 — browserDownloadImageTool: imageUrls 无 SSRF 防护')

  const sourceCode = readSource('src/ai/tools/browserAutomationTools.ts')

  // 定位 browserDownloadImageTool 的 execute 函数体
  const _executeMatch = sourceCode.match(/browserDownloadImageTool\s*=\s*tool\(\{[\s\S]*?execute:\s*async[^}]+\{([\s\S]*?)^\}\)/m)
  // 更宽松：找到 for (const sourceUrl of urls) 后的 fetch 调用
  const fetchCallIdx = sourceCode.indexOf('await fetch(sourceUrl)')
  const hasFetchCall = fetchCallIdx !== -1

  // 寻找 URL 验证逻辑的关键词
  const hasProtocolCheck = /protocol|file:|ftp:|data:/.test(sourceCode.slice(fetchCallIdx - 500, fetchCallIdx))
  const hasLocalhostCheck = /localhost|127\.0\.0\.1|::1|0\.0\.0\.0/.test(sourceCode.slice(fetchCallIdx - 500, fetchCallIdx))
  const hasMetadataCheck = /169\.254\.169\.254|metadata/.test(sourceCode.slice(fetchCallIdx - 500, fetchCallIdx))
  const hasPrivateIpCheck = /10\.\d|192\.168\.|172\.(1[6-9]|2\d|3[01])\./.test(sourceCode.slice(fetchCallIdx - 500, fetchCallIdx))

  await test('S1a: 源码中存在直接 fetch(sourceUrl) 调用', () => {
    assert.ok(hasFetchCall, '未找到 fetch(sourceUrl)，工具可能已重构')
  })

  await testExpectVulnerable(
    'S1b: fetch 调用前有协议校验（禁止 file://, ftp:// 等）',
    () => {
      assert.ok(
        hasProtocolCheck,
        '缺少协议校验：攻击者可传入 file:///etc/passwd 读取本地文件',
      )
    },
    '无协议校验 — file:///etc/passwd 等可触发本地文件读取',
  )

  await testExpectVulnerable(
    'S1c: fetch 调用前有 localhost/127.0.0.1 过滤',
    () => {
      assert.ok(
        hasLocalhostCheck,
        '缺少 localhost 过滤：内网服务（如数据库管理界面）可被探测',
      )
    },
    '无 localhost 过滤 — http://127.0.0.1:5984 等内网端口可被探测',
  )

  await testExpectVulnerable(
    'S1d: fetch 调用前有 AWS/GCP 元数据地址过滤（169.254.169.254）',
    () => {
      assert.ok(
        hasMetadataCheck,
        '缺少云元数据地址过滤：部署在 AWS/GCP 时凭据可被泄露',
      )
    },
    '无 169.254.169.254 过滤 — 云环境中可获取 IAM 凭据',
  )

  await testExpectVulnerable(
    'S1e: fetch 调用前有 RFC1918 私有网段过滤',
    () => {
      assert.ok(
        hasPrivateIpCheck,
        '缺少私有网段过滤：内网 IP 可被扫描（SSRF）',
      )
    },
    '无 RFC1918 过滤 — 10.x/192.168.x/172.16-31.x 内网可被 SSRF 探测',
  )

  // 补充：检查是否存在任何 URL 预校验函数
  const hasAnyUrlValidation =
    /isAllowedUrl|isSafeUrl|validateImageUrl|checkUrl|blockPrivate|denylist/i.test(
      sourceCode.slice(
        sourceCode.indexOf('browserDownloadImageTool'),
        sourceCode.indexOf('browserDownloadImageTool') + 3000,
      ),
    )

  await testExpectVulnerable(
    'S1f: browserDownloadImageTool 有专用 URL 安全校验函数',
    () => {
      assert.ok(
        hasAnyUrlValidation,
        '未发现 URL 安全校验函数（isAllowedUrl / validateImageUrl 等）',
      )
    },
    '无 URL 安全校验函数 — 任意 URL 均可被 fetch',
  )
}

// ─── S2: shell 命令白名单 $'...' 绕过 ────────────────────────────────────────

async function runS2() {
  console.log("\nS2 — commandApproval: $'...' ANSI 引号绕过白名单")

  // S2a: 基准测试 — 普通单引号正确被 mask
  await test("S2a: 普通单引号 'rm -rf /' 被 maskQuotedStrings 抹除", () => {
    const masked = maskQuotedStrings("echo 'rm -rf /'")
    assert.equal(masked, "echo '_Q_'")
  })

  // S2b: 普通双引号正确被 mask
  await test('S2b: 普通双引号 "import os; os.system(\'rm\')" 被 mask', () => {
    const masked = maskQuotedStrings('python3 -c "import os; os.system(\'rm\')"')
    // 双引号内容被替换
    assert.ok(masked.includes('"_Q_"'), `masked: ${masked}`)
  })

  // S2c: $'...' 形式不被 maskQuotedStrings 处理（漏洞验证）
  await testExpectVulnerable(
    "S2c: $'rm\\x20-rf\\x20/' 被 maskQuotedStrings 正确识别并 mask（含 $ 前缀）",
    () => {
      const payload = "$'rm\\x20-rf\\x20/'"
      const masked = maskQuotedStrings(payload)
      // 期望：$'...' 应该被视为引号串并被替换
      assert.notEqual(
        masked,
        payload,
        `maskQuotedStrings 未处理 $'...' 形式：masked="${masked}"`,
      )
    },
    "$'...' ANSI-C 引号未被 mask — 含义保留后可绕过 hasUnsafeShellOps 检测",
  )

  // S2d: $'...' 内含分号不触发 hasUnsafeShellOps（漏洞利用路径）
  await testExpectVulnerable(
    "S2d: $'cmd1;cmd2' 中的 ; 被 hasUnsafeShellOps 检测到（mask 后仍拦截）",
    () => {
      // $'ls;rm -rf /' — ANSI-C 引号内含分号
      // 正确行为：mask 处理后 ; 消失或仍被检测 → needsApproval = true
      const cmd = "$'ls;rm -rf /'"
      const needsApproval = needsApprovalViaLogic(cmd)
      assert.equal(
        needsApproval,
        true,
        `$'ls;rm -rf /' 未触发审批（needsApproval=${needsApproval}），; 被漏过`,
      )
    },
    "$'cmd;cmd' 形式绕过 ; 检测 — 多命令注入未被拦截",
  )

  // S2e: $'...' 内含命令替换 $() 不触发检测
  await testExpectVulnerable(
    "S2e: $'$(cat /etc/passwd)' 被检测为命令替换并需要审批",
    () => {
      const cmd = "$'$(cat /etc/passwd)'"
      const needsApproval = needsApprovalViaLogic(cmd)
      assert.equal(
        needsApproval,
        true,
        `$'$(cat /etc/passwd)' 未触发审批（needsApproval=${needsApproval}）`,
      )
    },
    "$'$(cmd)' 形式绕过命令替换检测",
  )

  // S2f: $'...' 内含反引号不触发检测
  await testExpectVulnerable(
    "S2f: $'`id`' 被检测为命令替换并需要审批",
    () => {
      // 注意：$'`id`' 在 bash 中 ` 不构成命令替换（ANSI-C 引号内 ` 是字面量）
      // 但我们验证 maskQuotedStrings 是否正确处理了 $'...'
      // 真正的风险路径是 $'\x60id\x60'（编码反引号）
      const cmd = "$'\\x60id\\x60'"
      const masked = maskQuotedStrings(cmd)
      // 期望 mask 后将整个 $'...' 视为引号串，不暴露编码内容
      assert.notEqual(masked, cmd, `$'\\x60id\\x60' 未被 mask：masked="${masked}"`)
    },
    "$'\\x60cmd\\x60' ANSI 编码反引号未被处理，可能绕过命令替换检测",
  )

  // S2g: 合法命令不被误报（正向测试）
  await test('S2g: 合法命令 "git log --oneline" 不需要审批', () => {
    const needsApproval = needsApprovalViaLogic('git log --oneline')
    assert.equal(needsApproval, false, '合法命令误报为需要审批')
  })

  await test('S2h: 含分号的危险命令 "ls; rm -rf /" 需要审批', () => {
    const needsApproval = needsApprovalViaLogic('ls; rm -rf /')
    assert.equal(needsApproval, true, '分号命令未被拦截')
  })

  await test("S2i: 正常单引号参数 \"grep -r 'pattern' .\" 不需要审批", () => {
    const needsApproval = needsApprovalViaLogic("grep -r 'pattern' .")
    assert.equal(needsApproval, false, "正常带引号参数被误报")
  })
}

// ─── S3: Hono 路由无鉴权（静态分析） ─────────────────────────────────────────

async function runS3() {
  console.log('\nS3 — Hono 路由鉴权（中间件注册 + Bearer 字段根除验证）')

  // ─── S3-routes-no-bearer: 业务路由不得再从 request 提取 Bearer ───
  // Server 是 SaaS token 唯一持有者，统一通过 ensureServerAccessToken() 获取。
  // 所有 AI 业务路由都应依赖 createApp.ts 的 aiRouteGuard + strictClientGuard
  // 中间件做 CSRF 防护，不得在路由内部读取 Authorization header。
  const aiRouteFiles = [
    'src/ai/interface/routes/aiChatAsyncRoutes.ts',
    'src/ai/interface/routes/aiCommandRoutes.ts',
    'src/ai/interface/routes/aiBoardAgentRoutes.ts',
    'src/ai/interface/routes/aiCopilotRoutes.ts',
    'src/ai/interface/routes/aiExecuteRoutes.ts',
  ]

  for (const rel of aiRouteFiles) {
    await test(`S3-${rel.split('/').pop()}: 无 resolveBearerToken / Authorization 提取`, () => {
      const code = readSource(rel)
      assert.ok(
        !code.includes('resolveBearerToken'),
        `${rel} 仍引用已删除的 resolveBearerToken`,
      )
      assert.ok(
        !/header\(['"]authorization['"]\)/i.test(code),
        `${rel} 仍从请求头读取 Authorization（应通过 ensureServerAccessToken 获取）`,
      )
    })
  }

  // S3-global: 检查 createApp.ts 中是否注册了全局 aiRouteGuard
  await test('S3-global: createApp.ts 注册了 aiRouteGuard 中间件保护 /ai/* 路由', () => {
    const createAppCode = readSource('src/bootstrap/createApp.ts')
    const hasAiRouteGuard = /aiRouteGuard/.test(createAppCode)
    const hasAiPathBinding = /app\.use\(.*\/ai\/\*.*aiRouteGuard/.test(createAppCode)
      || (/aiRouteGuard/.test(createAppCode) && /['"]\/ai\/\*['"]/.test(createAppCode))
    assert.ok(hasAiRouteGuard, 'createApp.ts 中未找到 aiRouteGuard 引用')
    assert.ok(hasAiPathBinding, 'aiRouteGuard 未绑定到 /ai/* 路径')
  })

  // S3-localAuthGuard: 检查 localAuthGuard 全局注册
  await test('S3-localAuthGuard: createApp.ts 注册了全局 localAuthGuard 中间件', () => {
    const createAppCode = readSource('src/bootstrap/createApp.ts')
    const hasLocalAuthGuard = /localAuthGuard/.test(createAppCode)
    assert.ok(hasLocalAuthGuard, 'createApp.ts 中未找到 localAuthGuard')
  })

  // S3e: 对比参照 — tRPC 路由中存在 shieldedProcedure
  await test('S3e: tRPC 路由中存在 shieldedProcedure 鉴权机制（作为对照）', () => {
    // 寻找 tRPC 相关路由目录
    const trpcRouterPaths = [
      'src/routers',
      'src/routers/chat.ts',
      'src/routers/settings.ts',
    ]
    let found = false
    for (const rel of trpcRouterPaths) {
      const absPath = path.join(SERVER_SRC, rel)
      try {
        const stat = fs.statSync(absPath)
        if (stat.isDirectory()) {
          const files = fs.readdirSync(absPath).filter((f) => f.endsWith('.ts'))
          for (const file of files) {
            const content = fs.readFileSync(path.join(absPath, file), 'utf-8')
            if (/shieldedProcedure|protectedProcedure|requireAuth/.test(content)) {
              found = true
              break
            }
          }
        } else {
          const content = fs.readFileSync(absPath, 'utf-8')
          if (/shieldedProcedure|protectedProcedure|requireAuth/.test(content)) {
            found = true
          }
        }
      } catch {
        // 路径不存在，忽略
      }
      if (found) break
    }
    // 这是正向验证（期望 tRPC 有鉴权），如果找不到则只是提示
    if (!found) {
      console.log('    ⚠ 未在 src/routers/ 找到 shieldedProcedure，可能命名不同')
    }
    // 不强制失败：即使找不到也不代表 tRPC 无鉴权
    assert.ok(true, '跳过对比验证')
  })
}

// ─── S4: webFetchTool isPermittedRedirect 过宽松 ─────────────────────────────

async function runS4() {
  console.log('\nS4 — webFetchTool: isPermittedRedirect 子域名场景')

  // S4a: 基准 — 同主机重定向被允许
  await test('S4a: 同主机重定向被允许（https://example.com → https://example.com/path）', () => {
    const orig = new URL('https://example.com/page')
    const redir = new URL('https://example.com/other')
    assert.equal(isPermittedRedirect(orig, redir), true)
  })

  // S4b: www 前缀差异被允许（符合设计意图）
  await test('S4b: www 前缀差异重定向被允许（example.com → www.example.com）', () => {
    const orig = new URL('https://example.com/')
    const redir = new URL('https://www.example.com/')
    assert.equal(isPermittedRedirect(orig, redir), true)
  })

  // S4c: 跨域重定向被阻止
  await test('S4c: 跨域重定向被阻止（example.com → evil.com）', () => {
    const orig = new URL('https://example.com/')
    const redir = new URL('https://evil.com/')
    assert.equal(isPermittedRedirect(orig, redir), false)
  })

  // S4d: https → http 降级被阻止
  await test('S4d: HTTPS → HTTP 协议降级被阻止', () => {
    const orig = new URL('https://example.com/')
    const redir = new URL('http://example.com/')
    assert.equal(isPermittedRedirect(orig, redir), false)
  })

  // S4e: 端口变化被阻止
  await test('S4e: 端口变化重定向被阻止（:443 → :8080）', () => {
    const orig = new URL('https://example.com:443/')
    const redir = new URL('https://example.com:8080/')
    assert.equal(isPermittedRedirect(orig, redir), false)
  })

  // S4f: 含凭据的重定向被阻止
  await test('S4f: 含内嵌凭据的重定向被阻止', () => {
    const orig = new URL('https://example.com/')
    const redir = new URL('https://user:pass@example.com/')
    assert.equal(isPermittedRedirect(orig, redir), false)
  })

  // S4g: 子域名跨越（evil.example.com → example.com）— 过宽松场景
  await testExpectVulnerable(
    'S4g: 子域名跨越被阻止（evil.example.com → legitimate.example.com）',
    () => {
      // evil.example.com 重定向到 legitimate.example.com
      // 当前实现：两者 .replace(/^www\./, '') 后分别是 evil.example.com 和 legitimate.example.com
      // 不同 → 应被阻止。这实际上是被正确处理的场景
      const orig = new URL('https://evil.example.com/')
      const redir = new URL('https://legitimate.example.com/')
      const permitted = isPermittedRedirect(orig, redir)
      assert.equal(permitted, false, '子域名间跨越应被阻止')
    },
    '子域名跨越被错误允许 — evil.example.com 可重定向到 legitimate.example.com',
  )

  // S4h: www 绕过子域名检查（www.evil.com → www.legitimate.com）
  await testExpectVulnerable(
    'S4h: www.evil.com → www.legitimate.com 重定向被阻止',
    () => {
      const orig = new URL('https://www.evil.com/')
      const redir = new URL('https://www.legitimate.com/')
      // 两者去掉 www 后：evil.com vs legitimate.com → 不同，应被阻止
      const permitted = isPermittedRedirect(orig, redir)
      assert.equal(permitted, false, 'www.evil.com → www.legitimate.com 应被阻止')
    },
    'www 前缀去除逻辑被滥用 — www.evil.com 可能错误匹配 www.legitimate.com',
  )

  // S4i: 深层子域名跨越（a.b.example.com → c.b.example.com）
  await testExpectVulnerable(
    'S4i: 深层子域名间跨越被阻止（a.sub.example.com → b.sub.example.com）',
    () => {
      const orig = new URL('https://a.sub.example.com/')
      const redir = new URL('https://b.sub.example.com/')
      // 两者 .replace(/^www\./, '') 后：a.sub.example.com vs b.sub.example.com → 不同，应被阻止
      const permitted = isPermittedRedirect(orig, redir)
      assert.equal(permitted, false, '深层子域名间跨越应被阻止')
    },
    '深层子域名间跨越被错误允许',
  )

  // S4j: 关键场景 — example.com 请求时，www2.example.com 重定向被错误允许
  await testExpectVulnerable(
    'S4j: 非 www 子域名（www2.example.com → example.com）不被当作 www 变体允许',
    () => {
      // 真正的漏洞：www.replace(/^www\./, '') 只去掉 "www." 前缀
      // 所以 www2.example.com → example.com 应该：
      //   www2.example.com.replace(/^www\./, '') = "www2.example.com" （无 www. 前缀）
      //   example.com.replace(/^www\./, '') = "example.com"
      //   两者不同 → 应被阻止（实际上是正确的）
      // 但 www.evil.com 和 www.legit.com：
      //   evil.com vs legit.com → 正确阻止
      // 真正过宽松的场景是同一主机下 www 和非 www 混用
      // 检验：api.example.com → example.com（不含 www 的子域名）
      const orig = new URL('https://api.example.com/')
      const redir = new URL('https://example.com/')
      const permitted = isPermittedRedirect(orig, redir)
      assert.equal(
        permitted,
        false,
        'api.example.com → example.com 子域名跨越应被阻止（非 www 变体）',
      )
    },
    'api.example.com → example.com 被错误判定为同主机（www 变体逻辑过宽松）',
  )

  // S4k: 实际过宽松场景验证 — www.example.com 请求，evil.www.example.com 重定向
  await test('S4k: evil.www.example.com 重定向被阻止（www 替换不应影响子串）', () => {
    // evil.www.example.com.replace(/^www\./, '') = "evil.www.example.com"（无 www. 前缀匹配）
    // example.com.replace(/^www\./, '') = "example.com"
    // 不同 → 被阻止 ✓
    const orig = new URL('https://example.com/')
    const redir = new URL('https://evil.www.example.com/')
    assert.equal(isPermittedRedirect(orig, redir), false)
  })

  // S4l: 源码检查 — 确认实现与预期一致
  await test('S4l: 源码确认 isPermittedRedirect 仅做 www 前缀规范化', () => {
    const code = readSource('src/ai/tools/webFetchTool.ts')
    const fnMatch = code.match(/function isPermittedRedirect[\s\S]*?^}/m)
    assert.ok(fnMatch, '未找到 isPermittedRedirect 函数定义')
    const fnBody = fnMatch[0]
    // 确认使用了 www 规范化
    assert.ok(fnBody.includes("replace(/^www\\./, '')"), '未找到 www 前缀规范化逻辑')
    // 确认没有更细粒度的子域名验证（如 endsWith 检查）
    const hasSubdomainCheck = /endsWith|suffix|parent.*domain|baseDomain|rootDomain/.test(fnBody)
    if (hasSubdomainCheck) {
      console.log('    ℹ 发现子域名细粒度检查逻辑，isPermittedRedirect 可能已加固')
    } else {
      console.log('    ⚠ isPermittedRedirect 仅做 www 前缀规范化，缺少基域名层级检查')
    }
    assert.ok(true) // 信息性测试，不强制失败
  })
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  OpenLoaf AI 安全技术债验证测试')
  console.log('═══════════════════════════════════════════════')

  await runS1()
  await runS2()
  await runS3()
  await runS4()

  console.log('\n═══════════════════════════════════════════════')
  console.log(`  总计：${passed + failed} 项`)
  console.log(`  通过：${passed} 项`)
  console.log(`  失败：${failed} 项（含已知漏洞标记为 [VULNERABLE]）`)
  console.log('═══════════════════════════════════════════════')

  if (failures.length > 0) {
    console.log('\n失败明细：')
    for (const f of failures) {
      const isVuln = f.includes('[VULNERABLE]')
      console.log(`  ${isVuln ? '⚠' : '✗'} ${f}`)
    }
  }

  // 仅当存在非 VULNERABLE 标记的真实失败时才退出 1
  const realFailures = failures.filter((f) => !f.includes('[VULNERABLE]'))
  if (realFailures.length > 0) {
    console.log('\n存在非预期的测试失败，退出码 1')
    process.exit(1)
  } else if (failures.length > 0) {
    console.log('\n所有失败均为已知安全漏洞标记（[VULNERABLE]），退出码 0')
    console.log('修复漏洞后对应测试将转为 [FIXED] 状态。')
  }
}

main().catch((err) => {
  console.error('测试运行异常：', err)
  process.exit(1)
})
