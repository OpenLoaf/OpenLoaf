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
 * Variant 参数 fixture — 每条记录代表一个 variant 的合法 v3Generate 请求。
 * 用于 schema 校验和键名断言测试。
 */
export type VariantFixture = {
  /** 人类可读的测试场景描述 */
  label: string
  feature: string
  variant: string
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: 1 | 2 | 4
  seed?: number
}

export const VARIANT_FIXTURES: Record<string, VariantFixture> = {
  // ═══ Image Generate ═══

  'OL-IG-001_basic': {
    label: '万相文生图 — 基础',
    feature: 'imageGenerate',
    variant: 'OL-IG-001',
    inputs: { prompt: 'a cat sitting on a windowsill' },
    params: { aspectRatio: '1:1', quality: 'standard' },
    count: 1,
  },
  'OL-IG-001_full': {
    label: '万相文生图 — 全参数',
    feature: 'imageGenerate',
    variant: 'OL-IG-001',
    inputs: { prompt: 'a cat', image: { url: 'https://example.com/ref.jpg' } },
    params: { aspectRatio: '16:9', quality: 'hd', negativePrompt: 'blurry' },
    count: 4,
  },
  'OL-IG-002_basic': {
    label: 'Z-Image-Turbo — 基础',
    feature: 'imageGenerate',
    variant: 'OL-IG-002',
    inputs: { prompt: 'a dog in the park' },
    params: { aspectRatio: '1:1', quality: 'standard' },
  },
  'OL-IG-003_basic': {
    label: '通义文生图 Plus — 基础',
    feature: 'imageGenerate',
    variant: 'OL-IG-003',
    inputs: { prompt: 'sunset over mountains' },
    params: { aspectRatio: '16:9', quality: 'hd', negativePrompt: 'dark' },
  },
  'OL-IG-004_basic': {
    label: '通义文生图 — 基础',
    feature: 'imageGenerate',
    variant: 'OL-IG-004',
    inputs: { prompt: 'forest landscape' },
    params: { aspectRatio: '4:3', quality: 'standard', negativePrompt: 'people' },
  },

  // 即梦文生图 — prompt 在 params！
  'OL-IG-005_basic': {
    label: '即梦文生图 v4.0 — 基础（prompt 在 params）',
    feature: 'imageGenerate',
    variant: 'OL-IG-005',
    inputs: {},
    params: { prompt: 'cyberpunk city', aspectRatio: '16:9', quality: 'standard' },
  },
  'OL-IG-005_with_images': {
    label: '即梦文生图 v4.0 — 带参考图',
    feature: 'imageGenerate',
    variant: 'OL-IG-005',
    inputs: { images: [{ url: 'https://example.com/ref1.jpg' }] },
    params: { prompt: 'cyberpunk city', aspectRatio: '1:1', quality: 'hd', style: 'anime' },
  },
  'OL-IG-006_basic': {
    label: '即梦文生图 v3.1 — 基础（prompt 在 params，无 style）',
    feature: 'imageGenerate',
    variant: 'OL-IG-006',
    inputs: {},
    params: { prompt: 'a peaceful village', aspectRatio: '1:1', quality: 'standard' },
  },

  // ═══ Image Edit ═══

  // OL-IE-001 = wan2.6（有 enable_interleave）
  'OL-IE-001_normal': {
    label: '图编 wan2.6 — 普通模式',
    feature: 'imageEdit',
    variant: 'OL-IE-001',
    inputs: { prompt: 'make it brighter', images: [{ url: 'https://example.com/a.jpg' }] },
    params: { enable_interleave: false },
  },
  'OL-IE-001_interleave': {
    label: '图编 wan2.6 — 图文混排模式',
    feature: 'imageEdit',
    variant: 'OL-IE-001',
    inputs: { prompt: 'replace background', images: [{ url: 'https://example.com/a.jpg' }] },
    params: { enable_interleave: true, negativePrompt: 'ugly' },
  },

  // OL-IE-002 = edit-plus（有 mask，无 enable_interleave）
  'OL-IE-002_basic': {
    label: '图编 plus — 基础',
    feature: 'imageEdit',
    variant: 'OL-IE-002',
    inputs: { prompt: 'remove the object', images: [{ url: 'https://example.com/a.jpg' }] },
    params: {},
  },
  'OL-IE-002_with_mask': {
    label: '图编 plus — 带蒙版',
    feature: 'imageEdit',
    variant: 'OL-IE-002',
    inputs: {
      prompt: 'remove the object',
      images: [{ url: 'https://example.com/a.jpg' }],
      mask: { url: 'https://example.com/mask.png' },
    },
    params: { negativePrompt: 'blur' },
  },

  // ═══ Image Inpaint ═══
  'OL-IP-001_basic': {
    label: '即梦修复 — 基础',
    feature: 'imageInpaint',
    variant: 'OL-IP-001',
    inputs: { image: { url: 'https://example.com/src.jpg' } },
    params: { prompt: 'fix the scratch' },
  },

  // ═══ Style Transfer ═══
  'OL-ST-001_basic': {
    label: '风格迁移 — 基础',
    feature: 'imageStyleTransfer',
    variant: 'OL-ST-001',
    inputs: { image: { url: 'https://example.com/style.jpg' } },
    params: { prompt: 'watercolor painting', aspectRatio: '1:1', quality: 'standard' },
  },

  // ═══ Upscale ═══
  'OL-UP-001_4k': {
    label: '超清 — 4K',
    feature: 'upscale',
    variant: 'OL-UP-001',
    inputs: { image: { url: 'https://example.com/low.jpg' } },
    params: { scale: '4K' },
  },
  'OL-UP-001_8k': {
    label: '超清 — 8K',
    feature: 'upscale',
    variant: 'OL-UP-001',
    inputs: { image: { url: 'https://example.com/low.jpg' } },
    params: { scale: '8K' },
  },

  // ═══ Outpaint ═══
  'OL-OP-001_basic': {
    label: '扩图 — 基础',
    feature: 'outpaint',
    variant: 'OL-OP-001',
    inputs: { image: { url: 'https://example.com/src.jpg' } },
    params: { xScale: 1.5, yScale: 1.5 },
  },

  // ═══ Material Extract ═══
  'OL-ME-001_basic': {
    label: '素材提取 — 基础',
    feature: 'materialExtract',
    variant: 'OL-ME-001',
    inputs: { image: { url: 'https://example.com/photo.jpg' } },
    params: {},
  },

  // ═══ Video Generate ═══

  'OL-VG-001_basic': {
    label: '百炼视频 Flash — 基础',
    feature: 'videoGenerate',
    variant: 'OL-VG-001',
    inputs: { prompt: 'a bird flying', startImage: { url: 'https://example.com/frame.jpg' } },
    params: { duration: 5 },
  },
  'OL-VG-001_full': {
    label: '百炼视频 Flash — 全参数',
    feature: 'videoGenerate',
    variant: 'OL-VG-001',
    inputs: { prompt: 'a bird flying', startImage: { url: 'https://example.com/frame.jpg' } },
    params: { duration: 5, withAudio: true, style: 'cinematic' },
  },
  'OL-VG-001_with_audio': {
    label: '百炼视频 Flash — 带音频输入',
    feature: 'videoGenerate',
    variant: 'OL-VG-001',
    inputs: {
      prompt: 'a bird flying',
      startImage: { url: 'https://example.com/frame.jpg' },
      audio: { url: 'https://example.com/bgm.wav' },
    },
    params: { duration: 5, withAudio: true },
  },
  'OL-VG-002_basic': {
    label: '百炼视频 标准 — 基础',
    feature: 'videoGenerate',
    variant: 'OL-VG-002',
    inputs: { prompt: 'ocean waves', startImage: { url: 'https://example.com/sea.jpg' } },
    params: { duration: 5 },
  },

  // 即梦视频 — prompt 在 params！
  'OL-VG-003_basic': {
    label: '即梦视频 — 基础（prompt 在 params）',
    feature: 'videoGenerate',
    variant: 'OL-VG-003',
    inputs: { startImage: { url: 'https://example.com/frame.jpg' } },
    params: { prompt: 'a dancing girl', duration: 5 },
  },
  'OL-VG-003_full': {
    label: '即梦视频 — 全参数',
    feature: 'videoGenerate',
    variant: 'OL-VG-003',
    inputs: {
      startImage: { url: 'https://example.com/frame.jpg' },
      images: [{ url: 'https://example.com/ref.jpg' }],
    },
    params: { prompt: 'a dancing girl', duration: 5, aspectRatio: '16:9', style: 'anime' },
  },

  // ═══ Lip Sync ═══
  'OL-LS-001_basic': {
    label: '口型同步 — 基础（video 不是 person）',
    feature: 'lipSync',
    variant: 'OL-LS-001',
    inputs: {
      video: { url: 'https://example.com/talking.mp4' },
      audio: { url: 'https://example.com/audio.wav' },
    },
    params: {},
  },

  // ═══ Digital Human ═══
  'OL-DH-001_480p': {
    label: '数字人 — 480P',
    feature: 'digitalHuman',
    variant: 'OL-DH-001',
    inputs: {
      image: { url: 'https://example.com/portrait.jpg' },
      audio: { url: 'https://example.com/speech.mp3' },
    },
    params: { resolution: '480P' },
  },
  'OL-DH-001_720p': {
    label: '数字人 — 720P',
    feature: 'digitalHuman',
    variant: 'OL-DH-001',
    inputs: {
      image: { url: 'https://example.com/portrait.jpg' },
      audio: { url: 'https://example.com/speech.mp3' },
    },
    params: { resolution: '720P' },
  },

  // ═══ Face Swap ═══
  'OL-FS-001_std': {
    label: '换脸 — 标准模式',
    feature: 'videoFaceSwap',
    variant: 'OL-FS-001',
    inputs: {
      image: { url: 'https://example.com/face.jpg' },
      video: { url: 'https://example.com/dance.mp4' },
    },
    params: { mode: 'wan-std' },
  },
  'OL-FS-002_pro': {
    label: '换脸 — 专业模式',
    feature: 'videoFaceSwap',
    variant: 'OL-FS-002',
    inputs: {
      image: { url: 'https://example.com/face.jpg' },
      video: { url: 'https://example.com/dance.mp4' },
    },
    params: { mode: 'wan-pro' },
  },

  // ═══ Video Translate ═══
  'OL-VT-001_zh_en': {
    label: '视频翻译 — 中文→英文',
    feature: 'videoTranslate',
    variant: 'OL-VT-001',
    inputs: { video: { url: 'https://example.com/chinese.mp4' } },
    params: { sourceLanguage: 'zh', targetLanguage: 'en' },
  },

  // ═══ TTS ═══
  'OL-TT-001_basic': {
    label: 'TTS — 默认参数',
    feature: 'tts',
    variant: 'OL-TT-001',
    inputs: { text: '你好世界' },
    params: {},
  },
  'OL-TT-001_custom': {
    label: 'TTS — 自定义语音参数',
    feature: 'tts',
    variant: 'OL-TT-001',
    inputs: { text: '你好世界' },
    params: { voice: 'longshu', format: 'wav', speechRate: 1.5, pitchRate: 0.8, volume: 80 },
  },
  'OL-TT-002_basic': {
    label: 'Qwen3 TTS — 默认参数',
    feature: 'tts',
    variant: 'OL-TT-002',
    inputs: { text: '你好世界' },
    params: {},
  },
  'OL-TT-002_custom': {
    label: 'Qwen3 TTS — 自定义参数',
    feature: 'tts',
    variant: 'OL-TT-002',
    inputs: { text: 'Hello world' },
    params: { voice: 'Serena', languageType: 'English', instruction: 'Speak slowly with a warm tone' },
  },

  // ═══ STT ═══
  'OL-SR-001_basic': {
    label: '语音识别 — 基础',
    feature: 'speechToText',
    variant: 'OL-SR-001',
    inputs: { audio: { url: 'https://example.com/recording.mp3' } },
    params: { enableItn: true },
  },
}
