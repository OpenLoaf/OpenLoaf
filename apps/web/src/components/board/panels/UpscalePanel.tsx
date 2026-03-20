/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { BOARD_GENERATE_INPUT } from '../ui/board-style-system'

/** Scale factor options for upscale. */
const SCALE_OPTIONS = [2, 4] as const

/** Hardcoded model options (placeholder until real model list is integrated). */
const MODEL_OPTIONS = [
  { id: 'auto', labelKey: 'upscalePanel.autoRecommend' },
  { id: 'real-esrgan-x4', label: 'Real-ESRGAN x4' },
  { id: 'stable-diffusion-upscale', label: 'SD Upscale' },
] as const

export type UpscalePanelProps = {
  sourceImageSrc: string
  onSubmit: (config: { scale: number; modelId: string }) => void
}

/** HD upscale parameter panel displayed below image nodes. */
export function UpscalePanel({
  sourceImageSrc,
  onSubmit,
}: UpscalePanelProps) {
  const { t } = useTranslation('board')

  const [scale, setScale] = useState<(typeof SCALE_OPTIONS)[number]>(2)
  const [modelId, setModelId] = useState('auto')

  const handleSubmit = () => {
    onSubmit({ scale, modelId })
  }

  return (
    <div className="flex w-[360px] flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
      {/* ── Title ── */}
      <h3 className="text-sm font-medium text-ol-text-primary">
        {t('upscalePanel.title')}
      </h3>

      {/* ── Scale Factor ── */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('upscalePanel.scaleFactor')}
        </label>
        <div className="flex gap-1.5">
          {SCALE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                scale === option
                  ? 'bg-ol-green/10 text-ol-green'
                  : 'bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-green/5 hover:text-ol-green',
              ].join(' ')}
              onClick={() => setScale(option)}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>

      {/* ── Model Select ── */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('upscalePanel.model')}
        </label>
        <select
          className={[
            'flex-1 rounded-lg border px-3 py-1.5 text-sm',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {'labelKey' in opt ? t(opt.labelKey) : opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Footer: Credits + Submit ── */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-ol-text-auxiliary">
          {t('upscalePanel.creditsCost')}
        </span>
        <button
          type="button"
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150',
            'bg-ol-green-bg text-ol-green hover:bg-ol-green-bg-hover',
          ].join(' ')}
          onClick={handleSubmit}
        >
          <Sparkles size={14} />
          {t('upscalePanel.submit')}
        </button>
      </div>
    </div>
  )
}
