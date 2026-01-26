import { createCatalog, generateCatalogPrompt } from "@json-render/core";
import { z } from "zod";

/** json-render component catalog for guarded UI generation. */
export const jsonRenderCatalog = createCatalog({
  components: {
    Card: {
      props: z.object({
        title: z.string().optional().describe("卡片标题。"),
        description: z.string().optional().describe("卡片说明文本。"),
      }),
      hasChildren: true,
    },
    Section: {
      props: z.object({
        title: z.string().optional().describe("区块标题。"),
        description: z.string().optional().describe("区块说明文本。"),
      }),
      hasChildren: true,
    },
    Form: {
      props: z.object({
        title: z.string().optional().describe("表单标题。"),
        description: z.string().optional().describe("表单说明文本。"),
      }),
      hasChildren: true,
    },
    Text: {
      props: z.object({
        content: z.string().describe("文本内容。"),
      }),
    },
    TextField: {
      props: z.object({
        label: z.string().optional().describe("字段标签。"),
        placeholder: z.string().optional().describe("输入占位提示。"),
        helperText: z.string().optional().describe("输入辅助说明。"),
        name: z.string().optional().describe("字段名称。"),
        path: z.string().optional().describe("数据绑定路径。"),
        required: z.boolean().optional().describe("是否必填。"),
        inputType: z
          .enum(["text", "email", "password", "number", "tel", "url"])
          .optional()
          .describe("输入类型。"),
      }),
    },
    TextArea: {
      props: z.object({
        label: z.string().optional().describe("字段标签。"),
        placeholder: z.string().optional().describe("输入占位提示。"),
        helperText: z.string().optional().describe("输入辅助说明。"),
        name: z.string().optional().describe("字段名称。"),
        path: z.string().optional().describe("数据绑定路径。"),
        required: z.boolean().optional().describe("是否必填。"),
        rows: z.number().int().min(1).max(20).optional().describe("输入行数。"),
      }),
    },
    Button: {
      props: z.object({
        label: z.string().describe("按钮文案。"),
        action: z.string().describe("触发动作名称。"),
        params: z.object({}).catchall(z.unknown()).describe("动作参数。"),
      }),
    },
  },
  actions: {
    submit: {
      params: z.object({}).catchall(z.unknown()).describe("提交动作参数。"),
    },
    cancel: {
      params: z.object({}).catchall(z.unknown()).describe("取消动作参数。"),
    },
  },
});

/** json-render system prompt derived from the catalog. */
// 逻辑：保持官方简洁提示词，并追加最小结构约束与示例。
export const jsonRenderSystemPrompt = [
  generateCatalogPrompt(jsonRenderCatalog).trim(),
  "",
  "## Output Rules",
  "- Each element must use `props` for component fields.",
  "- Keep element shape: { type, props, children? } (use `children` to connect nodes).",
  "- All nodes must be reachable from `root` via `children`.",
  "- Button actions must use `props.action` and `props.params`.",
  "",
  "## Minimal Example",
  "```json",
  "{",
  "  \"root\": \"form\",",
  "  \"elements\": {",
  "    \"form\": {",
  "      \"type\": \"Form\",",
  "      \"props\": { \"title\": \"邮件发送表单\" },",
  "      \"children\": [\"email\", \"submit\"]",
  "    },",
  "    \"email\": {",
  "      \"type\": \"TextField\",",
  "      \"props\": {",
  "        \"label\": \"邮箱地址\",",
  "        \"placeholder\": \"请输入收件人邮箱\",",
  "        \"path\": \"/email\",",
  "        \"required\": true,",
  "        \"inputType\": \"email\"",
  "      }",
  "    },",
  "    \"submit\": {",
  "      \"type\": \"Button\",",
  "      \"props\": { \"label\": \"发送邮件\", \"action\": \"submit\", \"params\": {} }",
  "    }",
  "  }",
  "}",
  "```",
].join("\n");
