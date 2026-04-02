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
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, shortPath, EmptyView, FilePathLink } from './shared/office-tool-utils'
import type { TFunction } from 'i18next'

const MAX_PREVIEW_CHARS = 2000

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function PptxStructureView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const slides = Array.isArray(data.slides)
    ? (data.slides as Record<string, unknown>[])
    : []
  const slideCount = typeof data.slideCount === 'number' ? data.slideCount : slides.length
  const masters = typeof data.masters === 'number' ? data.masters : 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{t('tool.pptx.slideCount', { count: slideCount })}</span>
        {masters > 0 && <span>{t('tool.pptx.masters', { count: masters })}</span>}
      </div>

      {slides.length > 0 && (
        <div className="space-y-1.5">
          {slides.map((slide, i) => {
            const index = typeof slide.index === 'number' ? slide.index : i
            const title = typeof slide.title === 'string' ? slide.title : ''
            const textBlocks = Array.isArray(slide.textBlocks) ? (slide.textBlocks as string[]) : []
            const images = Array.isArray(slide.images) ? (slide.images as string[]) : []
            const layout = typeof slide.layout === 'string' ? slide.layout : ''

            return (
              <div key={i} className="rounded border border-border/40 px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-bold text-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate text-xs font-medium">
                    {title || t('tool.pptx.untitled')}
                  </span>
                  {layout && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{layout}</span>
                  )}
                </div>
                {(textBlocks.length > 0 || images.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {textBlocks.length > 0 && (
                      <span>{t('tool.pptx.textBlocks', { count: textBlocks.length })}</span>
                    )}
                    {images.length > 0 && (
                      <span>{t('tool.word.images', { count: images.length })}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TextPreviewView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const rawText = typeof data.text === 'string' ? data.text : ''
  const truncated = data.truncated === true
  const characterCount = typeof data.characterCount === 'number' ? data.characterCount : rawText.length

  const displayText = rawText.length > MAX_PREVIEW_CHARS ? rawText.slice(0, MAX_PREVIEW_CHARS) : rawText
  const uiTruncated = rawText.length > MAX_PREVIEW_CHARS || truncated

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {characterCount > 0 && <span>{t('tool.word.characterCount', { count: characterCount })}</span>}
        {uiTruncated && <span className="text-muted-foreground">{t('tool.word.textTruncated')}</span>}
      </div>
      <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs leading-relaxed">
        {displayText}
      </pre>
    </div>
  )
}

function SlidePreviewList({
  slides,
  t,
}: {
  slides: Record<string, unknown>[]
  t: TFunction
}) {
  return (
    <div className="space-y-1">
      {slides.slice(0, 10).map((slide, i) => {
        const title = typeof slide.title === 'string' ? slide.title : ''
        const textBlocks = Array.isArray(slide.textBlocks) ? (slide.textBlocks as string[]) : []
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
              {i + 1}
            </span>
            <span className="min-w-0 truncate font-medium">{title || '—'}</span>
            {textBlocks.length > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t('tool.pptx.textBlocks', { count: textBlocks.length })}
              </span>
            )}
          </div>
        )
      })}
      {slides.length > 10 && (
        <div className="text-[10px] text-muted-foreground">{t('tool.office.more', { count: slides.length - 10 })}</div>
      )}
    </div>
  )
}

function EditOperationsPreview({
  edits,
  t,
}: {
  edits: Record<string, unknown>[]
  t: TFunction
}) {
  return (
    <div className="space-y-0.5">
      {edits.slice(0, 10).map((edit, i) => {
        const op = typeof edit.op === 'string' ? edit.op : '?'
        const editPath = typeof edit.path === 'string' ? edit.path : ''
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {op}
            </span>
            <span className="min-w-0 truncate font-mono text-muted-foreground">{editPath}</span>
          </div>
        )
      })}
      {edits.length > 10 && (
        <div className="text-[10px] text-muted-foreground">{t('tool.office.more', { count: edits.length - 10 })}</div>
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

export default function PptxTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)
  const isMutate = toolKind === 'PptxMutate'

  return (
    <OfficeToolShell
      part={part}
      className={className}
      toolKind={toolKind}
      isMutate={isMutate}
      i18nPrefix="tool.office"
    >
      {(ctx) => {
        const { data, input, mode, isPending, isDone, t } = ctx

        // Mutate pending: show preview from input
        if (isMutate && isPending && input) {
          const action = typeof input.action === 'string' ? input.action : ''
          if (action === 'create' && Array.isArray(input.slides)) {
            return <SlidePreviewList slides={input.slides as Record<string, unknown>[]} t={t} />
          }
          if (action === 'edit' && Array.isArray(input.edits)) {
            return <EditOperationsPreview edits={input.edits as Record<string, unknown>[]} t={t} />
          }
          const entries: ResultEntry[] = []
          if (typeof input.filePath === 'string') entries.push({ label: t('tool.office.file'), fileLink: input.filePath as string })
          if (action) entries.push({ label: t('tool.office.action'), value: action })
          return <MutateResultEntries entries={entries} />
        }

        // Done with output data
        if (data) {
          if (isMutate && isDone) {
            const action = typeof data.action === 'string' ? data.action : ''
            const entries: ResultEntry[] = []
            const resultFilePath = (typeof input?.filePath === 'string' ? input.filePath : data.filePath) as string | undefined
            if (typeof resultFilePath === 'string') entries.push({ label: t('tool.office.file'), fileLink: resultFilePath })
            if (action === 'create' && typeof data.slideCount === 'number') {
              entries.push({ label: t('tool.pptx.slideCount', { count: data.slideCount as number }), value: '' })
            }
            if (action === 'edit' && typeof data.editCount === 'number') {
              entries.push({ label: t('tool.pptx.editCount'), value: String(data.editCount) })
            }
            return <MutateResultEntries entries={entries} />
          }

          if (mode === 'read-structure') {
            return <PptxStructureView data={data} t={t} />
          }
          if (mode === 'read-text') {
            return <TextPreviewView data={data} t={t} />
          }
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
