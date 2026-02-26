/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport {
  MarkdownPlugin,
  deserializeMd,
  remarkMdx,
  remarkMention,
  serializeMd,
} from "@platejs/markdown";
import { createSlateEditor, type TNode } from "platejs";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const MARKDOWN_PLUGINS = [
  MarkdownPlugin.configure({
    options: {
      // 保持默认规则，预留 rules/allowedNodes/allowNode 的扩展入口
      rules: null,
      allowedNodes: null,
      allowNode: {
        deserialize: () => true,
        serialize: () => true,
      },
      remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
    },
  }),
];

const MARKDOWN_EDITOR = createSlateEditor({
  plugins: MARKDOWN_PLUGINS,
});

const DEFAULT_BLOCK_TYPE = "paragraph";

export type BlockInput = {
  type?: string | null;
  props?: Record<string, unknown> | null;
  content?: TNode | null;
  order?: number | null;
  parentId?: string | null;
};

export type BlockOutput = {
  type: string;
  props: Record<string, unknown> | null;
  content: TNode;
  order: number;
  parentId: string | null;
};

/** Convert markdown (MD/MDX) into top-level block records. */
export const markdownToBlocks = (markdown: string): BlockOutput[] => {
  if (!markdown.trim()) return [];

  const nodes = deserializeMd(MARKDOWN_EDITOR, markdown);

  // 顶层块只取 Markdown 反序列化后的第一层节点
  return nodes.map((node, index) => ({
    type: (node as { type?: string }).type ?? DEFAULT_BLOCK_TYPE,
    props: null,
    content: node,
    order: index,
    parentId: null,
  }));
};

/** Convert block records into markdown (MD/MDX). */
export const blocksToMarkdown = (blocks: BlockInput[]): string => {
  if (blocks.length === 0) return "";

  const nodes = [...blocks]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((block) => block.content)
    .filter((node): node is TNode => Boolean(node));

  if (nodes.length === 0) return "";

  // 统一从顶层块重建 Markdown
  const value = nodes as unknown as any[];
  // 序列化只需要顶层块节点，直接按 Descendant[] 处理即可
  return serializeMd(MARKDOWN_EDITOR, { value });
};
