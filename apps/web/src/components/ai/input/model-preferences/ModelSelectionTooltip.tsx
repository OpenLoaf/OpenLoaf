/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { Code, Image, MessageSquare, Video } from 'lucide-react'
import type { ProviderModelOption } from '@/lib/provider-models'
import type { AiModel } from '@openloaf-saas/sdk'
import { getModelLabel } from '@/lib/model-registry'
import { ModelIcon } from '@/components/setting/menus/provider/ModelIcon'

interface ModelSelectionTooltipProps {
  chatModels: ProviderModelOption[]
  imageModels: AiModel[]
  videoModels: AiModel[]
  codeModels: ProviderModelOption[]
  preferredChatIds: string[]
  preferredImageIds: string[]
  preferredVideoIds: string[]
  preferredCodeIds: string[]
}

export function ModelSelectionTooltip({
  chatModels,
  imageModels,
  videoModels,
  codeModels,
  preferredChatIds,
  preferredImageIds,
  preferredVideoIds,
  preferredCodeIds,
}: ModelSelectionTooltipProps) {
  const selectedChat = chatModels.filter((m) =>
    preferredChatIds.includes(m.id),
  )
  const selectedImage = imageModels.filter((m) =>
    preferredImageIds.includes(m.id),
  )
  const selectedVideo = videoModels.filter((m) =>
    preferredVideoIds.includes(m.id),
  )
  const selectedCode = codeModels.filter((m) =>
    preferredCodeIds.includes(m.id),
  )
  const hasAny =
    selectedChat.length > 0 ||
    selectedImage.length > 0 ||
    selectedVideo.length > 0 ||
    selectedCode.length > 0

  if (!hasAny) {
    return (
      <span className="text-xs opacity-70">
        未选择偏好模型
      </span>
    )
  }

  return (
    <div className="space-y-2.5 text-xs">
      {selectedChat.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
            <MessageSquare className="h-3 w-3" />
            对话
          </div>
          <div className="space-y-1">
            {selectedChat.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 opacity-80"
              >
                <ModelIcon
                  icon={
                    m.modelDefinition?.familyId ??
                    m.modelDefinition?.icon
                  }
                  model={m.modelId}
                  size={12}
                  className="h-3 w-3 shrink-0"
                />
                <span className="truncate">
                  {m.modelDefinition
                    ? getModelLabel(m.modelDefinition)
                    : m.modelId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedImage.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
            <Image className="h-3 w-3" />
            图像
          </div>
          <div className="space-y-1">
            {selectedImage.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 opacity-80"
              >
                <ModelIcon
                  icon={m.familyId ?? m.providerId ?? m.id}
                  model={m.id}
                  size={12}
                  className="h-3 w-3 shrink-0"
                />
                <span className="truncate">{m.name ?? m.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedVideo.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
            <Video className="h-3 w-3" />
            视频
          </div>
          <div className="space-y-1">
            {selectedVideo.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 opacity-80"
              >
                <ModelIcon
                  icon={m.familyId ?? m.providerId ?? m.id}
                  model={m.id}
                  size={12}
                  className="h-3 w-3 shrink-0"
                />
                <span className="truncate">{m.name ?? m.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedCode.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
            <Code className="h-3 w-3" />
            代码
          </div>
          <div className="space-y-1">
            {selectedCode.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 opacity-80"
              >
                <ModelIcon
                  icon={
                    m.modelDefinition?.familyId ??
                    m.modelDefinition?.icon
                  }
                  model={m.modelId}
                  size={12}
                  className="h-3 w-3 shrink-0"
                />
                <span className="truncate">
                  {m.modelDefinition
                    ? getModelLabel(m.modelDefinition)
                    : m.modelId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
