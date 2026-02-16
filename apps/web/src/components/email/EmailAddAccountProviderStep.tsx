import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { EMAIL_PROVIDER_PRESETS } from './email-provider-presets'

type ProviderSelectStepProps = {
  onSelectProvider: (providerId: string) => void
}

export function ProviderSelectStep({
  onSelectProvider,
}: ProviderSelectStepProps) {
  return (
    <div className="py-1">
      <div className="space-y-0.5">
        {EMAIL_PROVIDER_PRESETS.map((provider) => {
          const Icon = provider.icon
          const isCustom = provider.id === 'custom'
          return (
            <button
              type="button"
              key={provider.id}
              onClick={() => onSelectProvider(provider.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                'hover:bg-muted/60',
                isCustom && 'mt-2 border-t border-border/50 pt-3',
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted/50">
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-left text-sm font-medium text-foreground/90">
                {provider.name}
              </span>
              <ChevronRight className="size-4 text-muted-foreground/50" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
