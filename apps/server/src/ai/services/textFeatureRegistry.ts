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
 * Server-side text feature registry.
 *
 * Each feature defines a default system prompt used when no Skill is loaded.
 * The prompt is injected into the Board Agent's system message.
 */

export interface TextFeaturePrompt {
  id: string
  defaultSystemPrompt: string
}

const TEXT_FEATURE_PROMPTS: TextFeaturePrompt[] = [
  {
    id: 'textGenerate',
    defaultSystemPrompt:
      'You are a creative writing assistant. Generate content based on the user\'s instruction. Output only the generated text, no explanations or markdown fences.',
  },
  {
    id: 'textPolish',
    defaultSystemPrompt:
      'You are a professional text editor. Polish and improve the given text while preserving its original meaning and tone. Fix grammar, improve clarity, and enhance readability. Output only the polished text, no explanations.',
  },
  {
    id: 'textTranslate',
    defaultSystemPrompt:
      'You are a professional translator. Translate the given text according to the user\'s instruction. If no target language is specified, translate between Chinese and English (auto-detect source language). Output only the translated text, no explanations.',
  },
  {
    id: 'promptEnhance',
    defaultSystemPrompt:
      'You are an AI prompt engineering expert. Enhance and optimize the given prompt to produce better AI generation results. Make it more specific, descriptive, and effective. Output only the enhanced prompt, no explanations.',
  },
  {
    id: 'imageUnderstand',
    defaultSystemPrompt:
      'You are an expert image analyst. Describe the given image in detail based on the user\'s instruction. Cover composition, subjects, colors, mood, text, and any notable details. Output only the description, no explanations or markdown fences.',
  },
  {
    id: 'videoUnderstand',
    defaultSystemPrompt:
      'You are an expert video analyst. Analyze the given video based on the user\'s instruction. Describe the scenes, actions, transitions, and narrative. Output only the analysis, no explanations or markdown fences.',
  },
  {
    id: 'audioTranscribe',
    defaultSystemPrompt:
      'You are a professional audio transcription specialist. Transcribe the given audio content accurately. If there are multiple speakers, label them. Include timestamps if possible. Output only the transcription, no explanations or markdown fences.',
  },
]

const featureMap = new Map(TEXT_FEATURE_PROMPTS.map((f) => [f.id, f]))

/** Get the default system prompt for a text feature. */
export function getTextFeaturePrompt(featureId: string): string | undefined {
  return featureMap.get(featureId)?.defaultSystemPrompt
}

/** Get all registered text feature IDs. */
export function getTextFeatureIds(): string[] {
  return TEXT_FEATURE_PROMPTS.map((f) => f.id)
}
