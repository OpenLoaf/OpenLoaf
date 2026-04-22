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

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { trpc } from '@/utils/trpc'
import { FormDialog } from '@/components/ui/FormDialog'
import { Input } from '@openloaf/ui/input'
import { ExternalLink } from 'lucide-react'
import type { IntegrationDefinition } from '@openloaf/api/types/integrations'

type Props = {
  integration: IntegrationDefinition | null
  onClose: () => void
  onInstalled: () => void
}

export function InstallIntegrationDialog({ integration, onClose, onInstalled }: Props) {
  const { t } = useTranslation(['connections', 'common'])
  const [credentials, setCredentials] = useState<Record<string, string>>({})

  // Reset inputs when a different integration opens
  useEffect(() => {
    setCredentials({})
  }, [integration?.id])

  const installMutation = useMutation(
    trpc.integrations.installIntegration.mutationOptions({
      onSuccess: () => {
        toast.success(
          t('connections:installSuccess', { name: integration?.name ?? '' }),
        )
        onInstalled()
        onClose()
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  if (!integration) return null

  const isValid = integration.credentials.every(
    (field) => field.required === false || credentials[field.key]?.trim(),
  )

  const tr = (subKey: string, fallback: string) =>
    t(`connections:integrations.${integration.id}.${subKey}`, {
      defaultValue: fallback,
    })

  const localizedName = tr('name', integration.name)

  return (
    <FormDialog
      open={Boolean(integration)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('connections:installDialogTitle', { name: localizedName })}
      description={tr('description', integration.description)}
      submitLabel={t('connections:install')}
      submitting={installMutation.isPending}
      submitDisabled={!isValid}
      autoClose={false}
      contentClassName="sm:max-w-lg"
      onSubmit={async () => {
        await installMutation.mutateAsync({
          integrationId: integration.id,
          credentials,
        })
      }}
    >
      {/* Guide steps */}
      {integration.guide.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
            {t('connections:setupSteps')}
          </div>
          <ol className="space-y-2.5">
            {integration.guide.map((step, idx) => (
              <li key={`${integration.id}-step-${idx}`} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {tr(`guide.${idx}.title`, step.title)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {tr(`guide.${idx}.description`, step.description)}
                  </div>
                  {step.link ? (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {tr(`guide.${idx}.linkLabel`, step.link.label)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Credential inputs */}
      {integration.credentials.length > 0 && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          {integration.credentials.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label
                htmlFor={`integration-field-${field.key}`}
                className="text-xs font-medium text-foreground"
              >
                {tr(`credentials.${field.key}.label`, field.label)}
                {field.required !== false ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </label>
              <Input
                id={`integration-field-${field.key}`}
                type={
                  field.type === 'password'
                    ? 'password'
                    : field.type === 'url'
                      ? 'url'
                      : 'text'
                }
                placeholder={
                  field.placeholder
                    ? tr(`credentials.${field.key}.placeholder`, field.placeholder)
                    : undefined
                }
                value={credentials[field.key] ?? ''}
                onChange={(e) =>
                  setCredentials((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="h-9 rounded-3xl"
                autoComplete="off"
              />
              {field.helpText ? (
                <p className="text-[11px] text-muted-foreground/80">
                  {tr(`credentials.${field.key}.helpText`, field.helpText)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  )
}
