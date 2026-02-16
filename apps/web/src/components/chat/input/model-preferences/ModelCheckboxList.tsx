'use client'

import type { ProviderModelOption } from '@/lib/provider-models'
import type { AiModel } from '@tenas-saas/sdk'
import { getModelLabel } from '@/lib/model-registry'
import { ModelCheckboxItem } from './ModelCheckboxItem'

interface ChatModelCheckboxListProps {
  models: ProviderModelOption[]
  preferredIds: string[]
  disabled?: boolean
  onToggle: (modelId: string) => void
  emptyText?: string
}

export function ChatModelCheckboxList({
  models,
  preferredIds,
  disabled,
  onToggle,
  emptyText = '暂无可用模型',
}: ChatModelCheckboxListProps) {
  if (models.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    )
  }
  return (
    <div className="max-h-[28rem] space-y-0.5 overflow-y-auto">
      {models.map((option) => {
        const label = option.modelDefinition
          ? getModelLabel(option.modelDefinition)
          : option.modelId
        return (
          <ModelCheckboxItem
            key={option.id}
            icon={
              option.modelDefinition?.familyId ??
              option.modelDefinition?.icon
            }
            label={label}
            tags={option.tags}
            checked={preferredIds.includes(option.id)}
            disabled={disabled}
            onToggle={() => onToggle(option.id)}
          />
        )
      })}
    </div>
  )
}

interface MediaModelCheckboxListProps {
  models: AiModel[]
  preferredIds: string[]
  disabled?: boolean
  onToggle: (modelId: string) => void
  emptyText?: string
}

export function MediaModelCheckboxList({
  models,
  preferredIds,
  disabled,
  onToggle,
  emptyText = '暂无可用模型',
}: MediaModelCheckboxListProps) {
  if (models.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    )
  }
  return (
    <div className="max-h-[28rem] space-y-0.5 overflow-y-auto">
      {models.map((model) => (
        <ModelCheckboxItem
          key={`${model.providerId ?? 'unknown'}-${model.id}`}
          icon={model.familyId ?? model.id}
          label={model.name ?? model.id}
          checked={preferredIds.includes(model.id)}
          disabled={disabled}
          onToggle={() => onToggle(model.id)}
        />
      ))}
    </div>
  )
}
