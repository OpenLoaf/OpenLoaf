/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Local text feature registry for the Text AI Panel.
 *
 * Unlike image/video/audio panels that pull features from SaaS v3 capabilities,
 * text features are defined locally and driven by Board Agent + chat models.
 */

import type { LucideIcon } from 'lucide-react'
import { Eye, Film, Languages, Mic, Pen, Sparkles, Wand2 } from 'lucide-react'
import type { UpstreamData } from '../engine/upstream-data'

export type TextOutputMode = 'replace' | 'derive'

export interface TextFeatureDefinition {
  id: string
  /** i18n key for the feature label (under 'board' namespace). */
  labelKey: string
  icon: LucideIcon
  /** Determine if this feature is applicable given upstream data. */
  isApplicable: (upstream: UpstreamData | null) => boolean
  /** Model capability tags required for this feature. */
  requiredModelTags?: string[]
  /** Placeholder text for the instruction input (i18n key). */
  placeholderKey?: string
  /** How the generated text should be applied. */
  outputMode: TextOutputMode
}

/** All registered text features. Order determines tab display order. */
export const TEXT_FEATURES: TextFeatureDefinition[] = [
  {
    id: 'textGenerate',
    labelKey: 'textPanel.feature.generate',
    icon: Sparkles,
    isApplicable: () => true,
    placeholderKey: 'textPanel.placeholder.generate',
    outputMode: 'replace',
  },
  {
    id: 'textPolish',
    labelKey: 'textPanel.feature.polish',
    icon: Pen,
    isApplicable: (u) => (u?.textList.length ?? 0) > 0,
    placeholderKey: 'textPanel.placeholder.polish',
    outputMode: 'derive',
  },
  {
    id: 'textTranslate',
    labelKey: 'textPanel.feature.translate',
    icon: Languages,
    isApplicable: (u) => (u?.textList.length ?? 0) > 0,
    placeholderKey: 'textPanel.placeholder.translate',
    outputMode: 'derive',
  },
  {
    id: 'promptEnhance',
    labelKey: 'textPanel.feature.promptEnhance',
    icon: Wand2,
    isApplicable: (u) => (u?.textList.length ?? 0) > 0,
    placeholderKey: 'textPanel.placeholder.promptEnhance',
    outputMode: 'replace',
  },
  {
    id: 'imageUnderstand',
    labelKey: 'textPanel.feature.imageUnderstand',
    icon: Eye,
    isApplicable: (u) => (u?.imageList.length ?? 0) > 0,
    requiredModelTags: ['image_input'],
    placeholderKey: 'textPanel.placeholder.imageUnderstand',
    outputMode: 'derive',
  },
  {
    id: 'videoUnderstand',
    labelKey: 'textPanel.feature.videoUnderstand',
    icon: Film,
    isApplicable: (u) => (u?.videoList.length ?? 0) > 0,
    requiredModelTags: ['video_analysis'],
    placeholderKey: 'textPanel.placeholder.videoUnderstand',
    outputMode: 'derive',
  },
  {
    id: 'audioTranscribe',
    labelKey: 'textPanel.feature.audioTranscribe',
    icon: Mic,
    isApplicable: (u) => (u?.audioList.length ?? 0) > 0,
    requiredModelTags: ['audio_analysis'],
    placeholderKey: 'textPanel.placeholder.audioTranscribe',
    outputMode: 'derive',
  },
]

const featureMap = new Map(TEXT_FEATURES.map((f) => [f.id, f]))

/** Look up a feature definition by ID. */
export function getTextFeature(id: string): TextFeatureDefinition | undefined {
  return featureMap.get(id)
}

/** Get applicable features for current upstream context. */
export function getApplicableFeatures(
  upstream: UpstreamData | null,
): TextFeatureDefinition[] {
  return TEXT_FEATURES.filter((f) => f.isApplicable(upstream))
}
