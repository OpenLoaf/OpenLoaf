/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client';

import * as React from 'react';

import { type UseChatHelpers, useChat as useBaseChat } from '@ai-sdk/react';
import { AIChatPlugin, aiCommentToRange } from '@platejs/ai/react';
import { getCommentKey, getTransientCommentKey } from '@platejs/comment';
import { deserializeMd } from '@platejs/markdown';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { type UIMessage, DefaultChatTransport } from 'ai';
import { type TNode, KEYS, nanoid, NodeApi, TextApi } from 'platejs';
import { useEditorRef, usePluginOption } from 'platejs/react';

import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import { useBasicConfig } from '@/hooks/use-basic-config';
import { resolveServerUrl } from '@/utils/server-url';

import { discussionPlugin } from './plugins/discussion-kit';

export type ToolName = 'comment' | 'edit' | 'generate';

export type TComment = {
  comment: {
    blockId: string;
    comment: string;
    content: string;
  } | null;
  status: 'finished' | 'streaming';
};

export type MessageDataPart = {
  toolName: ToolName;
  comment?: TComment;
};

export type Chat = UseChatHelpers<ChatMessage>;

export type ChatMessage = UIMessage<{}, MessageDataPart>;

export const useChat = () => {
  const editor = useEditorRef();
  const options = usePluginOption(aiChatPlugin, 'chatOptions');
  const { basic } = useBasicConfig();
  const chatModelIdRef = React.useRef<string | null>(
    typeof basic.modelDefaultChatModelId === 'string'
      ? basic.modelDefaultChatModelId.trim() || null
      : null
  );
  const chatModelSourceRef = React.useRef<string>('local');

  const baseChat = useBaseChat<ChatMessage>({
    id: 'editor',
    transport: new DefaultChatTransport({
      api: `${resolveServerUrl()}${options.api || '/ai/command'}`,
      // 逻辑：注入 chatModelId 和 chatModelSource 到请求体。
      fetch: (async (input, init) => {
        const bodyOptions = editor.getOptions(aiChatPlugin).chatOptions?.body;

        const initBody = JSON.parse(init?.body as string);

        const bodyOptionsRecord =
          bodyOptions && typeof bodyOptions === 'object'
            ? (bodyOptions as Record<string, unknown>)
            : {};
        const explicitChatModelId =
          typeof bodyOptionsRecord.chatModelId === 'string'
            ? bodyOptionsRecord.chatModelId
            : undefined;
        const explicitChatModelSource =
          typeof bodyOptionsRecord.chatModelSource === 'string'
            ? bodyOptionsRecord.chatModelSource
            : undefined;
        const refChatModelId =
          typeof chatModelIdRef.current === 'string' ? chatModelIdRef.current : undefined;
        const refChatModelSource =
          typeof chatModelSourceRef.current === 'string'
            ? chatModelSourceRef.current
            : undefined;
        // 中文注释：显式 chatModelId 优先，其次使用最新设置值。
        const normalizedChatModelId =
          (explicitChatModelId ?? refChatModelId)?.trim() || undefined;
        const normalizedChatModelSource =
          (explicitChatModelSource ?? refChatModelSource)?.trim() || undefined;
        const { chatModelId: _ignored, chatModelSource: _ignoredSource, ...restBodyOptions } =
          bodyOptionsRecord;

        const body = {
          ...initBody,
          ...restBodyOptions,
          ...(normalizedChatModelId ? { chatModelId: normalizedChatModelId } : {}),
          ...(normalizedChatModelSource ? { chatModelSource: normalizedChatModelSource } : {}),
        };

        const response = await fetch(input, {
          ...init,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          let msg = 'AI 请求失败';
          try {
            const data = await response.clone().json();
            msg = data.error || data.message || msg;
          } catch {
            msg = (await response.text()) || msg;
          }
          throw new Error(msg);
        }

        return response;
      }) as typeof fetch,
    }),
    onData(data) {
      if (data.type === 'data-toolName') {
        editor.setOption(AIChatPlugin, 'toolName', data.data);
      }

      if (data.type === 'data-comment' && data.data) {
        if (data.data.status === 'finished') {
          editor.getApi(BlockSelectionPlugin).blockSelection.deselect();

          return;
        }

        const aiComment = data.data.comment!;
        const range = aiCommentToRange(editor, aiComment);

        if (!range) return console.warn('No range found for AI comment');

        const discussions =
          editor.getOption(discussionPlugin, 'discussions') || [];

        // Generate a new discussion ID
        const discussionId = nanoid();

        // Create a new comment
        const newComment = {
          id: nanoid(),
          contentRich: [{ children: [{ text: aiComment.comment }], type: 'p' }],
          createdAt: new Date(),
          discussionId,
          isEdited: false,
          userId: editor.getOption(discussionPlugin, 'currentUserId'),
        };

        // Create a new discussion
        const newDiscussion = {
          id: discussionId,
          comments: [newComment],
          createdAt: new Date(),
          documentContent: deserializeMd(editor, aiComment.content)
            .map((node: TNode) => NodeApi.string(node))
            .join('\n'),
          isResolved: false,
          userId: editor.getOption(discussionPlugin, 'currentUserId'),
        };

        // Update discussions
        const updatedDiscussions = [...discussions, newDiscussion];
        editor.setOption(discussionPlugin, 'discussions', updatedDiscussions);

        // Apply comment marks to the editor
        editor.tf.withMerging(() => {
          editor.tf.setNodes(
            {
              [getCommentKey(newDiscussion.id)]: true,
              [getTransientCommentKey()]: true,
              [KEYS.comment]: true,
            },
            {
              at: range,
              match: TextApi.isText,
              split: true,
            }
          );
        });
      }
    },

    ...options,
  });

  React.useEffect(() => {
    const normalized =
      typeof basic.modelDefaultChatModelId === 'string'
        ? basic.modelDefaultChatModelId.trim()
        : '';
    // 中文注释：为空代表 Auto，不透传 chatModelId。
    chatModelIdRef.current = normalized || null;
  }, [basic.modelDefaultChatModelId]);

  React.useEffect(() => {
    // 中文注释：仅允许 local/cloud，其他值默认本地。
    chatModelSourceRef.current = basic.chatSource === 'cloud' ? 'cloud' : 'local';
  }, [basic.chatSource]);

  const chat = {
    ...baseChat,
  };

  React.useEffect(() => {
    editor.setOption(AIChatPlugin, 'chat', chat as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, chat.messages, chat.error]);

  return chat;
};
