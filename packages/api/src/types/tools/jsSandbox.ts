/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

export const JS_SANDBOX_LIBS = [
  'pptxgenjs',   // PPTX 生成（首选，API 最友好）
  'docx',        // DOCX 生成（flumens/docx，结构化）
  'xlsx',        // XLSX 读写（SheetJS）
  'exceljs',     // XLSX 读写 + 样式 / chart / image（比 xlsx 更强）
  'pdf-lib',     // PDF 编辑（合并 / 水印 / 旋转 / 填表）
  'pdfkit',      // PDF 从零生成（向量 / 文字 / 图）
  'pdf-parse',   // PDF 文本提取
  'mammoth',     // DOCX → HTML / 文本
  'sharp',       // 图片处理（大件 / 性能好）
  'jimp',        // 图片处理（纯 JS / 无 native）
  'archiver',    // zip / tar 打包
  'fflate',      // 轻量 zip（同步 / 流式）
  'adm-zip',     // zip 读写
  'dayjs',       // 日期
  'lodash',      // 工具库
  'marked',      // Markdown → HTML
  'qrcode',      // 二维码
] as const

const LIBS_LIST = JS_SANDBOX_LIBS.map(n => `  - ${n}`).join('\n')

export const jsSandboxToolDef = {
  id: 'JsSandbox',
  readonly: false,
  name: 'JS Sandbox',
  description: `Run Node.js (ESM) code in an isolated subprocess to create / edit binary files (PDF / DOCX / XLSX / PPTX / images / zips) or to do any computation Office-native tools can't express cleanly.

**When to use**
- **创建或修改** PDF / DOCX / XLSX / PPTX（本工具取代了原来的 PdfMutate / WordMutate / ExcelMutate / PptxMutate）
- 批处理图片 / 压缩解压 / 精确格式转换
- 任何需要 "写几行代码就行" 的自定义逻辑

**When NOT to use**
- 只是想读 PDF / DOCX / XLSX 的内容 / 元数据 → 用 \`PdfInspect\` / \`WordInspect\` / \`ExcelInspect\`（更快、返回结构化）
- docx ↔ pdf / html / md 互转 → 用 \`DocConvert\`
- 调用云服务（图像理解 / 生成 / TTS）→ 用对应 Cloud* 工具
- 读 / 改项目里的源代码 → 用 Read / Edit / Write

**Execution model**
- 独立 Node 子进程运行你的 ESM 代码，cwd 锁定在当前 session 的 asset 目录（或 project root）
- 代码默认超时 30 秒，最大 120 秒
- 预装依赖（require / import 以下库即可，**不要 require 列表外**的包）：
${LIBS_LIST}
- Node 内置模块全部可用：\`fs\` / \`path\` / \`url\` / \`crypto\` / \`zlib\` / \`stream\` / \`buffer\` / \`child_process\`（禁用）等
- 可以用相对路径写文件（落到 cwd 下），也可以用 \`process.env.OPENLOAF_ASSET_DIR\` 取 session 绝对路径

**Script reuse 协议 — 重要**
- 每次 \`action:'run'\` 会把你提交的代码存为 \`<assetDir>/scripts/run-<timestamp>.mjs\`，返回的 \`scriptPath\` 是绝对路径
- 第一次运行失败想修一两行时：**不要**整段代码重传；改用 \`action:'edit-and-run'\` + \`scriptPath\` + \`edits:[{find,replace}]\`，只传改动点，省 token 又省脑力
- \`action:'run-saved'\` 可以直接重跑之前的脚本（比如在多轮对话里复用）

**Output contract**
- 最终信息用 \`console.log\` 输出；\`console.error\` 归到 stderr
- 返回写入 / 修改的文件列表靠 cwd 下的文件系统 diff，你不用显式声明
- 任何异常会变成 \`exitCode !== 0\`，别 swallow 异常（让它抛出，diagnoser 更好定位）

**Examples**（各 skill 文档里有完整案例）
\`\`\`js
// PPT: 用 pptxgenjs
import pptxgen from 'pptxgenjs'
const pres = new pptxgen()
const s = pres.addSlide()
s.addText('Hello', { x: 1, y: 1, fontSize: 36 })
await pres.writeFile({ fileName: 'hello.pptx' })
console.log('pptx done')
\`\`\`

遇到库的 API 不确定 → 先写 \`console.log(Object.keys(lib))\` 探明再动手，别猜。`,
  parameters: z.object({
    action: z
      .enum(['run', 'run-saved', 'edit-and-run'])
      .default('run')
      .describe('run=新脚本；run-saved=重跑已有 scriptPath；edit-and-run=对 scriptPath 应用 edits 后再跑'),
    code: z
      .string()
      .optional()
      .describe('action=run 时必填，完整 ESM 代码。其他 action 忽略。'),
    scriptPath: z
      .string()
      .optional()
      .describe('action=run-saved 或 edit-and-run 时必填，之前返回过的绝对路径。'),
    edits: z
      .array(
        z.object({
          find: z.string().min(1).max(2000),
          replace: z.string().max(2000),
        }),
      )
      .max(10)
      .optional()
      .describe('action=edit-and-run 时的最小改动列表。每对 find 必须在脚本中唯一。'),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(120_000)
      .optional()
      .describe('默认 30000。最大 120000。'),
    description: z
      .string()
      .max(200)
      .optional()
      .describe('一句话说明这次脚本做什么；会写到落盘脚本注释里方便回溯。'),
  }),
  component: null,
} as const
