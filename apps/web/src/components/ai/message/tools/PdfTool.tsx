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

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { FileTextIcon, LoaderCircleIcon, XCircleIcon, CheckCircle2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  Collapsible,
  CollapsibleTrigger,
} from '@openloaf/ui/collapsible'
import {
  ToolOutputContent,
  ToolOutputError,
  ToolOutputLoading,
} from './shared/ToolOutput'
import {
  getDisplayPath,
  getToolKind,
  isToolStreaming,
  type AnyToolPart,
} from './shared/tool-utils'
import { parseOutput, parseInput, getMode, EmptyView, FilePathLink } from './shared/office-tool-utils'
import type { TFunction } from 'i18next'

const MAX_PREVIEW_CHARS = 2000

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function PdfStructureView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : 0
  const fileSize = typeof data.fileSize === 'number' ? data.fileSize : 0
  const hasForm = data.hasForm === true
  const formFieldCount = typeof data.formFieldCount === 'number' ? data.formFieldCount : 0
  const metadata = typeof data.metadata === 'object' && data.metadata != null
    ? (data.metadata as Record<string, unknown>)
    : {}

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const metaEntries = Object.entries(metadata).filter(([, v]) => v != null && v !== '')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded bg-secondary px-2 py-0.5 font-medium text-foreground">
          {t('tool.pdf.pageCount', { count: pageCount })}
        </span>
        <span className="text-muted-foreground">{t('tool.pdf.fileSize')}: {formatSize(fileSize)}</span>
        {hasForm && (
          <span className="rounded bg-secondary px-2 py-0.5 text-foreground">
            {t('tool.pdf.formFieldCount', { count: formFieldCount })}
          </span>
        )}
      </div>

      {metaEntries.length > 0 && (
        <div className="rounded border border-border/40">
          <div className="bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {t('tool.pdf.metadata')}
          </div>
          <div className="space-y-0.5 px-2 py-1.5">
            {metaEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 capitalize text-muted-foreground">{key}</span>
                <span className="min-w-0 truncate font-mono">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PdfTextPreviewView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const rawText = typeof data.text === 'string' ? data.text : ''
  const truncated = data.truncated === true
  const characterCount = typeof data.characterCount === 'number' ? data.characterCount : rawText.length
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : undefined

  const displayText = rawText.length > MAX_PREVIEW_CHARS ? rawText.slice(0, MAX_PREVIEW_CHARS) : rawText
  const uiTruncated = rawText.length > MAX_PREVIEW_CHARS || truncated

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {pageCount != null && <span>{t('tool.pdf.pageCount', { count: pageCount })}</span>}
        <span>{t('tool.word.characterCount', { count: characterCount })}</span>
        {uiTruncated && <span className="text-muted-foreground">{t('tool.word.textTruncated')}</span>}
      </div>
      <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs leading-relaxed">
        {displayText}
      </pre>
    </div>
  )
}

function PdfFormFieldsView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const fields = Array.isArray(data.fields)
    ? (data.fields as Record<string, unknown>[])
    : []
  const fieldCount = typeof data.fieldCount === 'number' ? data.fieldCount : fields.length

  if (fields.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground">
        {t('tool.pdf.noFormFields')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {t('tool.pdf.formFieldCount', { count: fieldCount })}
      </div>
      <div className="max-h-[320px] overflow-auto rounded border border-border/40">
        <table className="w-full border-collapse text-xs font-mono">
          <thead>
            <tr className="sticky top-0 z-10 bg-muted/80">
              <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldName')}
              </th>
              <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldType')}
              </th>
              <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldValue')}
              </th>
              <th className="border-b border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldOptions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              <tr key={i} className="even:bg-muted/30">
                <td className="max-w-[160px] truncate border-r border-border/30 px-2 py-0.5 font-medium">
                  {String(field.name ?? '')}
                </td>
                <td className="border-r border-border/30 px-2 py-0.5 text-muted-foreground">
                  {String(field.type ?? '')}
                </td>
                <td className="max-w-[160px] truncate border-r border-border/30 px-2 py-0.5">
                  {String(field.value ?? '—')}
                </td>
                <td className="max-w-[160px] truncate px-2 py-0.5 text-muted-foreground">
                  {Array.isArray(field.options) ? (field.options as string[]).join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PdfScreenshotView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const url = typeof data.url === 'string' ? data.url : ''
  const pageNumber = typeof data.pageNumber === 'number' ? data.pageNumber : 1
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : undefined
  const width = typeof data.width === 'number' ? data.width : 0
  const height = typeof data.height === 'number' ? data.height : 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>
          {t('tool.pdf.screenshotPage', { page: pageNumber, total: pageCount ?? '?' })}
        </span>
        <span>{width}×{height}px</span>
      </div>
      {url && (
        <div className="max-h-[400px] overflow-auto rounded border border-border/40">
          <img
            src={url}
            alt={`PDF page ${pageNumber}`}
            className="w-full"
            loading="lazy"
          />
        </div>
      )}
    </div>
  )
}

type ResultEntry = { label: string; value?: string; fileLink?: string }

function MutateResultEntries({ entries }: { entries: ResultEntry[] }) {
  if (entries.length === 0) return <EmptyView />
  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{entry.label}</span>
          {entry.fileLink ? (
            <FilePathLink filePath={entry.fileLink} />
          ) : entry.value ? (
            <span className="truncate font-mono text-foreground">{entry.value}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PdfTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const toolKind = getToolKind(part)
  const isInspect = toolKind === 'PdfInspect'

  const streaming = isToolStreaming(part)
  const state = typeof part.state === 'string' ? part.state : ''
  const isDone = state === 'output-available'
  const isError = state === 'output-error'
  const hasError = isError || state === 'output-denied'

  const { ok, data, error: outputError } = parseOutput(part)
  const input = parseInput(part)
  const mode = getMode(data, input)

  const displayError = part.errorText || outputError || (!ok && isDone ? t('tool.office.operationFailed') : '')

  // File open support
  const filePath = typeof input?.filePath === 'string' ? input.filePath : typeof data?.filePath === 'string' ? data.filePath : ''
  const fileDisplayName = filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''

  const { projectId, tabId, sessionId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const displayPath = getDisplayPath(filePath, projectRootUri)

  const handleOpen = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!filePath) return
      const entry = createFileEntryFromUri({ uri: filePath, name: fileDisplayName })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, sessionId, rootUri: projectRootUri })
    },
    [filePath, fileDisplayName, tabId, projectId, sessionId, projectRootUri],
  )

  // i18n tool display name — follow the actual toolKind so PdfInspect gets
  // its own label rather than being surfaced as "PDF Operations".
  const toolName = t(`toolNames.${toolKind}`, { defaultValue: 'PDF' })

  const renderContent = () => {
    if (streaming) {
      return <ToolOutputLoading label={t('tool.office.processing')} />
    }

    if (displayError) {
      return <ToolOutputError message={displayError} />
    }

    // Done with output data
    if (data) {
      // PdfInspect — unified summary of whatever action returned.
      if (isInspect && isDone) {
        const action = typeof data.action === 'string' ? data.action : ''
        const entries: ResultEntry[] = []
        const resultFilePath = (typeof input?.filePath === 'string' ? input.filePath : data.filePath) as string | undefined
        if (typeof resultFilePath === 'string') entries.push({ label: t('tool.office.file'), fileLink: resultFilePath })
        if (action) entries.push({ label: t('tool.office.action'), value: action })
        if (action === 'summary') {
          if (typeof data.pageCount === 'number') entries.push({ label: t('tool.pdf.pageCount', { count: data.pageCount as number }), value: '' })
          if (typeof data.textType === 'string') entries.push({ label: 'textType', value: data.textType as string })
          if (data.isEncrypted === true) entries.push({ label: 'encrypted', value: data.needsPassword === true ? 'needs password' : 'yes' })
          if (data.hasForm === true && typeof data.formFieldCount === 'number') {
            entries.push({ label: 'form fields', value: String(data.formFieldCount) })
          }
          if (data.suggestedNextTool && typeof data.suggestedNextTool === 'object') {
            const st = data.suggestedNextTool as Record<string, unknown>
            const hint = [st.tool, st.action].filter(Boolean).join(':')
            if (hint) entries.push({ label: 'next', value: hint })
          }
        }
        if (action === 'text' && typeof data.characterCount === 'number') {
          entries.push({ label: 'chars', value: String(data.characterCount) })
        }
        if (action === 'form-fields' && Array.isArray(data.fields)) {
          entries.push({ label: 'fields', value: String((data.fields as unknown[]).length) })
        }
        if (action === 'images' && Array.isArray(data.images)) {
          entries.push({ label: 'images', value: String((data.images as unknown[]).length) })
        }
        if (action === 'annotations' && Array.isArray(data.annotations)) {
          entries.push({ label: 'annotations', value: String((data.annotations as unknown[]).length) })
        }
        if (action === 'tables' && Array.isArray(data.tables)) {
          entries.push({ label: 'tables', value: String((data.tables as unknown[]).length) })
        }
        if (action === 'render' && Array.isArray(data.pages)) {
          entries.push({ label: 'rendered', value: String((data.pages as unknown[]).length) })
        }
        return <MutateResultEntries entries={entries} />
      }

      // Query views
      if (mode === 'read-structure') {
        return <PdfStructureView data={data} t={t} />
      }
      if (mode === 'read-text') {
        return <PdfTextPreviewView data={data} t={t} />
      }
      if (mode === 'read-form-fields') {
        return <PdfFormFieldsView data={data} t={t} />
      }
      if (mode === 'read-screenshot') {
        return <PdfScreenshotView data={data} t={t} />
      }
    }

    return <EmptyView />
  }

  return (
    <Collapsible className={cn('min-w-0 text-xs', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {toolName}
            </span>
            {displayPath ? (
              <span
                className="min-w-0 cursor-pointer truncate font-mono text-xs text-muted-foreground/50 hover:text-foreground hover:underline"
                onClick={handleOpen}
              >
                {displayPath}
              </span>
            ) : null}
            {streaming ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : isDone ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {displayPath ? (
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {displayPath}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {renderContent()}

      </ToolOutputContent>
    </Collapsible>
  )
}
