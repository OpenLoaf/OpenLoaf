/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * AI 媒体生成统一接口类型定义
 * =============================
 *
 * 设计原则：
 * 1. 模型无关 —— 所有参数面向用户意图，不暴露模型细节
 * 2. 后端适配 —— 模型不支持的参数由后端负责转换/降级/多次调用
 * 3. 渐进式 —— 所有参数都是可选的，合理默认值由后端决定
 * 4. 统一输入格式 —— 媒体输入（图片/视频/音频/文本）使用统一结构
 *
 * 关于枚举值:
 * - 字符串枚举值（如 aspectRatio、resolution、quality）是前端合法值的完整集合
 * - 后端负责将这些统一值映射到具体模型的参数格式
 * - 模型不支持某个值时，后端选择最接近的替代或通过后处理实现
 */

// ===========================================================================
// 第一层：通用媒体输入类型
// ===========================================================================

/**
 * 媒体资源引用 —— 所有媒体输入的基础单元。
 *
 * 支持三种引用方式（互斥，按优先级排列）：
 * 1. url —— 可公开访问的 URL（SaaS 后端直接下载）
 * 2. base64 —— Base64 编码的二进制数据（适用于小文件或本地资源）
 * 3. nodeId —— 画布节点引用（前端在提交前解析为 url/base64）
 *
 * 后端适配策略：
 * - 本地 URL（localhost/127.0.0.1）→ 上传到 S3 获取公开 URL 或转 base64
 * - base64 体积过大时 → 先上传到临时存储再传 URL 给模型
 */
export type MediaRef = {
  /** 可公开访问的资源 URL。 */
  url?: string
  /** Base64 编码的二进制数据。 */
  base64?: string
  /** 资源的 MIME 类型（当使用 base64 时必填）。 */
  mediaType?: string
  /**
   * 画布节点 ID 引用。
   * 前端提交前会解析为 url 或 base64，此字段仅用于前端中间态追踪。
   * 后端不应依赖此字段。
   */
  nodeId?: string
}

/**
 * 图片输入集合。
 *
 * 后端适配策略：
 * - 模型不支持多图 → 后端取第一张或多次调用
 * - 模型不支持 mask → 后端忽略该字段
 * - 模型不支持 sketch → 后端将涂鸦叠加到参考图上
 */
export type ImageInputs = {
  /** 参考图片列表（图生图、多图参考、局部重绘原图等）。 */
  images?: MediaRef[]
  /**
   * 遮罩图（用于局部重绘/擦除）。
   * 白色区域 = 需要处理的区域，黑色区域 = 保留原始内容。
   */
  mask?: MediaRef
  /**
   * 涂鸦引导图（用于涂鸦引导生成）。
   * 用户在画布上绘制的简笔画，AI 基于此生成完整图片。
   */
  sketch?: MediaRef
}

/**
 * 视频输入集合。
 *
 * 后端适配策略：
 * - startImage/endImage：模型不支持首尾帧 → 后端只取 startImage 作为首帧
 * - referenceVideo：模型不支持参考视频 → 后端提取关键帧作为图片输入
 * - motionVideo：模型不支持动作迁移 → 后端降级为普通视频生成
 */
export type VideoInputs = {
  /** 参考图片列表（角色参考、场景参考等）。 */
  images?: MediaRef[]
  /** 视频首帧图片。 */
  startImage?: MediaRef
  /** 视频尾帧图片（用于首尾帧生视频）。 */
  endImage?: MediaRef
  /** 参考视频（用于视频编辑/延展/参考生视频）。 */
  referenceVideo?: MediaRef
  /** 动作参考视频（用于动作迁移）。 */
  motionVideo?: MediaRef
}

/**
 * 音频输入集合。
 *
 * 后端适配策略：
 * - referenceAudio 用于声音复刻：模型不支持 → 后端忽略，使用默认音色
 * - audioTracks 用于混音/拼接：模型不支持多轨 → 后端用 ffmpeg 预处理
 * - sourceAudio 用于编辑/处理类功能的原始音频输入
 */
export type AudioInputs = {
  /** 参考音频（用于声音复刻、声画同步等）。 */
  referenceAudio?: MediaRef
  /** 待处理的源音频（用于降噪、人声分离、语音转换等编辑类功能）。 */
  sourceAudio?: MediaRef
  /**
   * 多轨音频列表（用于音频拼接/混音）。
   * 每轨包含音频资源引用和可选的轨道级参数。
   */
  audioTracks?: AudioTrackInput[]
}

/**
 * 单轨音频输入（用于拼接/混音场景）。
 *
 * 后端适配策略：
 * - volume/startOffset 不被模型支持 → 后端通过 ffmpeg 预处理实现
 * - trimStart/trimEnd → 后端在送入模型前裁剪
 */
export type AudioTrackInput = {
  /** 音频资源引用。 */
  audio: MediaRef
  /**
   * 音量倍率。
   * 范围 0-3.0：1.0 = 原始音量。
   * 默认值：1.0。
   */
  volume?: number
  /**
   * 在最终输出中的起始偏移（秒）。
   * 仅混音模式使用：指定此轨在时间轴上的放置位置。
   * 默认值：0（从头开始）。
   */
  startOffset?: number
  /**
   * 裁剪起点（秒）。
   * 从源音频的指定时间点开始截取。
   */
  trimStart?: number
  /**
   * 裁剪终点（秒）。
   * 截取到源音频的指定时间点。
   */
  trimEnd?: number
}

/**
 * 数字人/人物相关输入集合。
 *
 * 后端适配策略：
 * - 模型不支持多人脸 → 后端只取第一张人脸图
 */
export type PersonInputs = {
  /** 人物图片（全身/半身照）。 */
  personImage?: MediaRef
  /** 人脸图片（用于视频换脸）。 */
  faceImage?: MediaRef
  /** 驱动音频（用于口播/数字人）。 */
  drivingAudio?: MediaRef
  /** 驱动视频（用于动作迁移）。 */
  drivingVideo?: MediaRef
  /** 衣服图片（用于虚拟试衣）。 */
  garmentImage?: MediaRef
}

// ===========================================================================
// 第二层：通用输出控制
// ===========================================================================

/**
 * 宽高比。
 *
 * 后端适配策略：
 * - 'auto' → 后端根据输入素材自动推断，或使用模型默认值
 * - 模型不支持指定比例 → 后端选择最接近的比例 + 后处理裁剪
 */
export type AspectRatio = 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '21:9'

/**
 * 分辨率等级。
 *
 * 后端适配策略：
 * - '1K' → 映射到模型的标准分辨率（如 1024x1024）
 * - '2K' → 映射到模型的高分辨率（如 2048x2048），不支持则先生成 1K 后超分
 * - '4K' → 映射到模型的超高分辨率（如 4096x4096），不支持则先生成后超分
 */
export type Resolution = '1K' | '2K' | '4K'

/**
 * 生成质量等级。
 *
 * 后端适配策略：
 * - 'draft' → 使用模型的快速/低质量模式（如 turbo/flash 变体）
 * - 'standard' → 使用模型的标准质量设置
 * - 'hd' → 使用模型的最高质量设置（如 pro 变体、多步采样）
 */
export type Quality = 'draft' | 'standard' | 'hd'

/**
 * 音频输出格式。
 *
 * 后端适配策略：
 * - 模型不支持指定格式 → 后端生成后转码
 */
export type AudioFormat = 'mp3' | 'wav' | 'pcm' | 'opus' | 'flac' | 'aac'

// ===========================================================================
// 第三层：通用基础请求类型
// ===========================================================================

/**
 * 所有媒体生成请求的公共基础字段。
 *
 * 这些字段适用于全部 18 个功能，任何功能类型都可以使用。
 */
export type MediaGenerateBase = {
  /**
   * 功能标识符，标识请求的具体功能类型。
   * 后端据此路由到对应的模型适配器。
   */
  feature: MediaFeature

  /**
   * 模型 ID。
   * - 'auto' 或不填 → 后端根据功能类型自动选择最佳模型
   * - 具体 ID → 使用指定模型（如 'wan2.6-t2i'、'jimeng_t2i_v40'）
   *
   * 后端适配策略：
   * - 指定的模型不可用 → 返回错误（不静默降级，让用户知情）
   */
  modelId?: string

  /**
   * 生成数量。
   * 所有功能都支持，即使底层模型不支持批量。
   *
   * 后端适配策略：
   * - 模型原生支持批量（如即梦 4.0 最多 15 张） → 直接传 count 参数
   * - 模型不支持批量 → 后端并发发起 count 次独立调用，聚合结果
   * - 默认值：1
   * - 最大值由后端根据功能类型限制（图片最多 9，视频最多 4，音频最多 4）
   */
  count?: number

  /**
   * 生成质量。
   *
   * 后端适配策略：
   * - 映射到模型的 quality / steps / 变体选择
   * - 默认值：'standard'
   */
  quality?: Quality

  /**
   * 随机种子，用于结果复现。
   *
   * 后端适配策略：
   * - 模型支持 seed → 直接传入
   * - 模型不支持 seed → 后端忽略（结果不可精确复现）
   * - 不填 → 后端随机生成
   */
  seed?: number

  /**
   * 文本提示词。
   * 大多数生成功能的核心输入，描述期望的生成结果。
   * 部分功能（如抠图、擦除、超清放大）可为空。
   */
  prompt?: string

  /**
   * 反向提示词，描述不想在结果中出现的元素。
   *
   * 后端适配策略：
   * - 模型支持 negativePrompt → 直接传入
   * - 模型不支持 → 后端将其融入正向 prompt（如添加 "NOT: xxx"）或忽略
   */
  negativePrompt?: string

  /**
   * 风格预设名称。
   * 统一的风格描述词（如 '写实'、'动漫'、'3D'、'水彩'），不依赖具体模型。
   *
   * 后端适配策略：
   * - 模型有对应 style 参数 → 映射到模型预设
   * - 模型无 style 参数 → 将风格描述融入 prompt 前缀
   */
  style?: string

  /**
   * 模型特定的扩展参数。
   * 用于传递当前类型系统未覆盖的、模型特有的高级参数。
   * 键值对形式，后端按模型类型解释。
   *
   * 注意：尽量使用上层定义的通用参数，此字段仅作为逃逸口。
   */
  parameters?: Record<string, unknown>
}

// ===========================================================================
// 第四层：功能枚举
// ===========================================================================

/**
 * 所有支持的 AI 媒体生成功能标识符。
 * 每个标识符对应一个独立的功能入口和后端适配逻辑。
 */
export type MediaFeature =
  // ── 图片类 ──
  | 'image-generate'        // F01 图片生成
  | 'image-poster'          // F02 创意海报
  | 'image-inpaint'         // F03 局部重绘
  | 'image-erase'           // F04 擦除/去除
  | 'image-upscale'         // F05 超清放大
  | 'image-outpaint'        // F06 扩图
  | 'image-edit'            // F07 图片编辑
  | 'image-matting'         // F08 抠图
  // ── 视频类 ──
  | 'video-generate'        // F09 视频生成
  | 'video-edit'            // F10 视频编辑/延展
  | 'video-motion'          // F11 运动控制
  // ── 数字人类 ──
  | 'avatar-lipsync'        // F12 数字人/口播
  | 'avatar-faceswap'       // F13 视频换脸
  | 'avatar-motion-transfer' // F14 动作迁移
  // ── 电商垂直 ──
  | 'ecommerce-tryon'       // F15 虚拟试衣
  // ── 音频类 —— 生成 ──
  | 'audio-tts'             // F16 语音合成（文本→语音）
  | 'audio-music'           // F17 音乐生成（描述→音乐）
  | 'audio-sfx'             // F18 音效生成（描述→音效）
  | 'audio-singing'         // F19 歌声合成（歌词+曲谱→歌声）
  // ── 音频类 —— 编辑/处理 ──
  | 'audio-voice-clone'     // F20 声音复刻（参考音频→自定义音色 ID）
  | 'audio-voice-convert'   // F21 语音转换（音频A+目标音色→音频B）
  | 'audio-denoise'         // F22 音频降噪/增强（嘈杂音频→干净音频）
  | 'audio-separate'        // F23 人声分离（音频→人声+伴奏）
  | 'audio-mix'             // F24 音频拼接/混音（多段音频→合成一段）
  // ── 音频类 —— 理解 ──
  | 'audio-asr'             // F25 语音识别（音频→文字+时间戳）
  | 'audio-understand'      // F26 音频理解（音频→内容/情绪/风格描述）

// ===========================================================================
// 第五层：图片类功能请求
// ===========================================================================

// ---- F01 图片生成 ----

/**
 * 图片生成子模式。
 *
 * 后端根据子模式和输入内容自动路由到对应的模型 API。
 */
export type ImageGenerateMode =
  | 'text-to-image'     // 纯文本生成
  | 'image-reference'   // 图片参考（图生图）
  | 'sketch-guide'      // 涂鸦引导
  | 'cartoon-reference' // 卡通/动漫参考

/**
 * F01 图片生成请求。
 *
 * 对应 API：
 * - 即梦 jimeng_t2i_v40（文生图/多图参考）
 * - 万相 wan2.6-t2i（文生图）
 * - flux 系列
 */
export type ImageGenerateRequest = MediaGenerateBase & {
  feature: 'image-generate'

  /** 必填：文本描述。 */
  prompt: string

  /**
   * 生成子模式。
   * 不填时后端根据 inputs 内容自动推断：
   * - 无图片输入 → text-to-image
   * - 有图片输入 → image-reference
   *
   * 后端适配策略：
   * - sketch-guide 模式但模型不支持 → 降级为 image-reference
   * - cartoon-reference 模式但模型不支持 → 降级为 image-reference + 风格提示
   */
  mode?: ImageGenerateMode

  /** 图片输入（参考图、涂鸦等）。 */
  inputs?: ImageInputs

  /** 输出宽高比。默认 '1:1'。 */
  aspectRatio?: AspectRatio

  /** 输出分辨率等级。默认 '1K'。 */
  resolution?: Resolution

  /**
   * 参考图的影响强度。
   * 范围 0-1：0 = 完全忽略参考图，1 = 最大程度保持参考图特征。
   *
   * 后端适配策略：
   * - 映射到模型的 strength/denoising_strength 等参数
   * - 模型不支持强度控制 → 后端忽略
   * - 默认值由后端根据模式决定（text-to-image 不适用，image-reference 默认 0.6）
   */
  referenceStrength?: number
}

// ---- F02 创意海报 ----

/**
 * F02 创意海报请求。
 *
 * 对应 API：即梦海报生成（或通过图片生成 + prompt 工程实现）。
 */
export type PosterGenerateRequest = MediaGenerateBase & {
  feature: 'image-poster'

  /**
   * 海报标题（主标题）。
   *
   * 后端适配策略：
   * - 模型有独立标题参数 → 直接传入
   * - 模型无独立参数 → 后端将标题融入 prompt（如 "标题为'xxx'的海报"）
   */
  title: string

  /**
   * 海报副标题/文案内容。
   *
   * 后端适配策略：同 title。
   */
  subtitle?: string

  /**
   * 视觉描述/画面说明（即 prompt）。
   * 描述海报的整体视觉效果、配色、构图等。
   */
  prompt: string

  /** 参考图片（品牌元素、产品图等）。 */
  inputs?: ImageInputs

  /** 输出宽高比。默认 '3:4'（竖版海报）。 */
  aspectRatio?: AspectRatio

  /** 输出分辨率。默认 '2K'。 */
  resolution?: Resolution
}

// ---- F03 局部重绘 ----

/**
 * F03 局部重绘（Inpaint）请求。
 *
 * 对应 API：
 * - 即梦 jimeng_image2image_dream_inpaint
 * - 通用 inpaint 模型
 */
export type InpaintRequest = MediaGenerateBase & {
  feature: 'image-inpaint'

  /** 必填：对遮罩区域的描述（想要生成什么）。 */
  prompt: string

  /** 必填：原图 + 遮罩。 */
  inputs: ImageInputs & {
    /** 必填：至少一张原图。 */
    images: [MediaRef, ...MediaRef[]]
    /** 必填：遮罩图。 */
    mask: MediaRef
  }

  /** 输出分辨率。默认与原图相同。 */
  resolution?: Resolution
}

// ---- F04 擦除/去除 ----

/**
 * F04 擦除/去除请求。
 * 从图片中去除指定区域的内容，智能填充背景。
 *
 * 对应 API：通用 inpaint（prompt 为空或 "remove"）、专用擦除模型。
 */
export type EraseRequest = MediaGenerateBase & {
  feature: 'image-erase'

  /**
   * 可选：擦除后的填充描述。不填则智能推断背景。
   *
   * 后端适配策略：
   * - prompt 为空 → 使用 "remove the masked area and fill with background" 类似默认提示
   */
  prompt?: string

  /** 必填：原图 + 可选遮罩。 */
  inputs: ImageInputs & {
    /** 必填：原图。 */
    images: [MediaRef, ...MediaRef[]]
    /**
     * 遮罩图（标记要擦除的区域）。
     * 不提供时后端使用自动检测（如显著性检测）。
     *
     * 后端适配策略：
     * - 模型需要 mask 但未提供 → 返回错误要求用户标记区域
     */
    mask?: MediaRef
  }
}

// ---- F05 超清放大 ----

/**
 * F05 超清放大（Super Resolution）请求。
 *
 * 对应 API：
 * - 即梦 jimeng_i2i_seed3_tilesr_cvtob
 * - Real-ESRGAN 等超分模型
 */
export type UpscaleRequest = MediaGenerateBase & {
  feature: 'image-upscale'

  /** prompt 可选：放大时的画面优化描述（部分模型支持引导放大）。 */
  prompt?: string

  /** 必填：待放大的原图。 */
  inputs: ImageInputs & {
    images: [MediaRef, ...MediaRef[]]
  }

  /**
   * 放大倍率。
   *
   * 后端适配策略：
   * - 模型支持的倍率 → 直接传入
   * - 模型不支持指定倍率（如只支持 2x）→ 后端多次调用（4x = 2x × 2x）
   * - 默认值：2
   */
  scale?: 2 | 4 | 8

  /**
   * 目标分辨率（与 scale 互斥，二选一）。
   * 指定目标分辨率时后端自动计算所需倍率。
   */
  targetResolution?: Resolution
}

// ---- F06 扩图 ----

/**
 * 扩图方向。
 */
export type OutpaintDirection = 'left' | 'right' | 'up' | 'down' | 'all'

/**
 * F06 扩图（Outpainting）请求。
 * 将图片在指定方向上扩展，AI 生成延续内容。
 *
 * 对应 API：通用 outpaint 模型、即梦扩图。
 */
export type OutpaintRequest = MediaGenerateBase & {
  feature: 'image-outpaint'

  /** 可选：对扩展区域内容的描述。不填则自动推断。 */
  prompt?: string

  /** 必填：原图。 */
  inputs: ImageInputs & {
    images: [MediaRef, ...MediaRef[]]
  }

  /**
   * 扩展方向。
   * - 'all' → 四个方向等量扩展
   * - 具体方向 → 仅向指定方向扩展
   *
   * 后端适配策略：
   * - 模型不支持指定方向 → 后端通过 padding + crop 模拟
   */
  direction: OutpaintDirection | OutpaintDirection[]

  /**
   * 扩展比例。
   * 表示扩展区域相对于原图对应边长的比例。
   * 范围 0.1-2.0：0.5 = 扩展原图宽/高的 50%。
   * 默认值：0.5。
   *
   * 后端适配策略：
   * - 映射到模型的 padding pixels 参数
   * - 模型有固定扩展比例 → 后端选择最接近的值
   */
  expandRatio?: number

  /** 目标宽高比（与 direction + expandRatio 互斥）。 */
  targetAspectRatio?: AspectRatio
}

// ---- F07 图片编辑 ----

/**
 * 图片编辑子模式。
 */
export type ImageEditMode =
  | 'instruct-edit'   // 指令编辑（用文字描述修改）
  | 'style-transfer'  // 风格迁移（将图片转为指定风格）
  | 'colorize'        // 上色（黑白图片→彩色）

/**
 * F07 图片编辑请求。
 *
 * 对应 API：通用图片编辑模型（InstructPix2Pix 等）。
 */
export type ImageEditRequest = MediaGenerateBase & {
  feature: 'image-edit'

  /**
   * 编辑指令。
   * - instruct-edit：描述要做的修改（如"把天空变成日落色"）
   * - style-transfer：目标风格描述（如"转为莫奈风格油画"）
   * - colorize：上色指导（如"暖色调，秋天氛围"），可为空
   */
  prompt: string

  /** 编辑子模式。不填时默认为 'instruct-edit'。 */
  mode?: ImageEditMode

  /** 必填：待编辑的原图。 */
  inputs: ImageInputs & {
    images: [MediaRef, ...MediaRef[]]
  }

  /**
   * 编辑强度。
   * 范围 0-1：0 = 几乎不变，1 = 最大程度修改。
   * 默认值由后端根据模式决定（instruct-edit: 0.7, style-transfer: 0.8, colorize: 1.0）。
   */
  editStrength?: number
}

// ---- F08 抠图 ----

/**
 * F08 抠图（Matting）请求。
 * 从图片中提取前景主体，去除背景。
 *
 * 对应 API：SAM 系列、通用抠图模型。
 */
export type MattingRequest = MediaGenerateBase & {
  feature: 'image-matting'

  /**
   * 可选：描述要保留的主体。
   * 不填时自动检测最显著的前景主体。
   */
  prompt?: string

  /** 必填：待抠图的原图。 */
  inputs: ImageInputs & {
    images: [MediaRef, ...MediaRef[]]
  }

  /**
   * 输出格式。
   * - 'rgba' → 透明背景的 PNG（默认）
   * - 'mask' → 仅输出遮罩图（黑白）
   * - 'both' → 同时输出抠图结果和遮罩
   */
  outputMode?: 'rgba' | 'mask' | 'both'
}

// ===========================================================================
// 第六层：视频类功能请求
// ===========================================================================

// ---- F09 视频生成 ----

/**
 * 视频生成子模式。
 *
 * 后端根据子模式路由到对应的模型 API。
 */
export type VideoGenerateMode =
  | 'text-to-video'      // 纯文本生成
  | 'first-frame'        // 首帧图生视频
  | 'first-last-frame'   // 首尾帧生视频
  | 'image-reference'    // 参考图生视频
  | 'storyboard'         // 分镜生视频（多图顺序生成）
  | 'with-audio'         // 带声生视频（文本+音频→视频）

/**
 * F09 视频生成请求。
 *
 * 对应 API：
 * - 万相 wan2.6-t2v（文生视频）
 * - 万相 wan2.6-i2v（首帧图生视频）
 * - 万相 wan2.2-kf2v（首尾帧生视频）
 * - 万相 wan2.6-r2v（参考生视频）
 * - 即梦 jimeng_ti2v_v30_pro（文生/图生视频）
 */
export type VideoGenerateRequest = MediaGenerateBase & {
  feature: 'video-generate'

  /** 文本描述（大多数模式下必填）。 */
  prompt: string

  /**
   * 生成子模式。
   * 不填时后端根据 inputs 内容自动推断：
   * - 无输入 → text-to-video
   * - 有 startImage → first-frame
   * - 有 startImage + endImage → first-last-frame
   *
   * 后端适配策略：
   * - first-last-frame 但模型只支持首帧 → 后端只传 startImage，忽略 endImage
   * - storyboard 但模型不支持 → 后端分段生成再拼接
   * - with-audio 但模型不支持音频输入 → 后端先生成视频再叠加音频
   */
  mode?: VideoGenerateMode

  /** 视频输入（首帧、尾帧、参考视频等）。 */
  inputs?: VideoInputs

  /** 音频输入（配音/背景音乐，用于 with-audio 模式）。 */
  audioInputs?: AudioInputs

  /** 输出宽高比。默认 '16:9'。 */
  aspectRatio?: AspectRatio

  /**
   * 输出时长（秒）。
   *
   * 后端适配策略：
   * - 模型支持的时长选项 → 映射到最接近的值
   * - 模型只支持固定时长 → 后端裁剪到指定时长
   * - 默认值：5
   * - 最大值由后端根据模型限制（通常 5-30 秒）
   */
  duration?: number

  /**
   * 是否生成配套音效/音乐。
   *
   * 后端适配策略：
   * - 模型原生支持音频生成（如万相 wan2.6 的 supportsAudio）→ 启用
   * - 模型不支持 → 后端忽略或通过额外音效生成模型补充
   * - 默认值：false
   */
  withAudio?: boolean

  /**
   * 视频清晰度。
   * - '720p' / '1080p' / '4K'
   *
   * 后端适配策略：
   * - 映射到模型的 clarity/resolution 参数
   * - 模型不支持指定清晰度 → 选择最接近的或后处理提升
   */
  clarity?: '720p' | '1080p' | '4K'
}

// ---- F10 视频编辑/延展 ----

/**
 * 视频编辑子模式。
 */
export type VideoEditMode =
  | 'extend'        // 视频延展（从尾帧续写）
  | 'edit'          // 视频编辑（基于指令修改）
  | 'loop'          // 循环化（将视频处理为无缝循环）

/**
 * F10 视频编辑/延展请求。
 *
 * 对应 API：
 * - 万相 wanx2.1-vace-plus（通用视频编辑）
 */
export type VideoEditRequest = MediaGenerateBase & {
  feature: 'video-edit'

  /**
   * 编辑指令。
   * - extend：描述续写内容（如"镜头继续向前推进，出现城市天际线"）
   * - edit：描述修改内容（如"将白天改为黑夜"）
   * - loop：可选描述循环衔接点
   */
  prompt: string

  /** 编辑子模式。不填时默认为 'edit'。 */
  mode?: VideoEditMode

  /** 必填：原视频。 */
  inputs: VideoInputs & {
    referenceVideo: MediaRef
  }

  /**
   * 延展时长（秒，仅 extend 模式）。
   * 表示在原视频基础上额外生成的时长。
   * 默认值：5
   */
  extendDuration?: number

  /** 输出宽高比（编辑后可能需要裁剪）。 */
  aspectRatio?: AspectRatio
}

// ---- F11 运动控制 ----

/**
 * 镜头运动类型。
 */
export type CameraMotion =
  | 'pan-left' | 'pan-right'
  | 'tilt-up' | 'tilt-down'
  | 'zoom-in' | 'zoom-out'
  | 'dolly-in' | 'dolly-out'
  | 'orbit-left' | 'orbit-right'
  | 'static'

/**
 * F11 运动控制请求。
 * 根据图片 + 运动描述生成动态视频。
 *
 * 对应 API：万相运动控制模型、通用图生视频 + 运动参数。
 */
export type MotionControlRequest = MediaGenerateBase & {
  feature: 'video-motion'

  /** 可选：运动/场景描述。 */
  prompt?: string

  /** 必填：原图。 */
  inputs: VideoInputs & {
    images: [MediaRef, ...MediaRef[]]
  }

  /**
   * 镜头运动类型。
   * 可组合多个运动（如 ['zoom-in', 'pan-left'] 表示推进+左移）。
   *
   * 后端适配策略：
   * - 模型支持镜头参数 → 映射到对应参数
   * - 模型不支持 → 融入 prompt（如 "camera slowly zooms in and pans left"）
   */
  cameraMotion?: CameraMotion | CameraMotion[]

  /**
   * 运动路径点序列。
   * 用于精确控制主体运动轨迹。
   * 每个点包含归一化坐标 (x, y) 和时间戳 t。
   *
   * 后端适配策略：
   * - 模型支持路径控制 → 直接传入
   * - 模型不支持 → 后端通过 prompt 描述运动趋势
   */
  motionPath?: Array<{ x: number; y: number; t: number }>

  /**
   * 运动速度倍率。
   * 范围 0.25-4.0：1.0 = 正常速度。
   * 默认值：1.0。
   */
  motionSpeed?: number

  /** 输出时长（秒）。默认 5。 */
  duration?: number

  /** 输出宽高比。 */
  aspectRatio?: AspectRatio
}

// ===========================================================================
// 第七层：数字人类功能请求
// ===========================================================================

// ---- F12 数字人/口播 ----

/**
 * F12 数字人/口播请求。
 * 驱动人物图片/视频根据音频进行口型同步。
 *
 * 对应 API：
 * - 万相 wan2.2-s2v（声动人像）
 * - videoretalk（视频口型同步）
 */
export type LipsyncRequest = MediaGenerateBase & {
  feature: 'avatar-lipsync'

  /** 可选：场景/动作描述（部分模型支持）。 */
  prompt?: string

  /** 人物输入。 */
  personInputs: PersonInputs & {
    /** 必填：人物图片或人物视频（通过 drivingVideo 传入）。 */
    personImage: MediaRef
  }

  /**
   * 驱动音频。
   * 与 personInputs.drivingAudio 等价，此处为便捷字段。
   * 同时传入时以此字段优先。
   */
  audioInput?: MediaRef

  /**
   * 驱动方式。
   * - 'audio' → 音频驱动口型（默认）
   * - 'text' → TTS 合成后驱动（需要 prompt 提供文本内容）
   */
  driveMode?: 'audio' | 'text'

  /**
   * TTS 音色 ID（driveMode 为 'text' 时生效）。
   * 后端先调用 TTS 生成音频，再用音频驱动口型。
   */
  voiceId?: string

  /** 输出时长。不填则由音频时长决定。 */
  duration?: number

  /** 输出宽高比。默认与输入一致。 */
  aspectRatio?: AspectRatio
}

// ---- F13 视频换脸 ----

/**
 * F13 视频换脸请求。
 * 将视频中的人脸替换为指定人脸。
 *
 * 对应 API：
 * - 万相 wan2.2-animate-mix
 */
export type FaceswapRequest = MediaGenerateBase & {
  feature: 'avatar-faceswap'

  /** 可选：场景描述。 */
  prompt?: string

  /** 人物输入。 */
  personInputs: PersonInputs & {
    /** 必填：目标人脸图片。 */
    faceImage: MediaRef
  }

  /** 必填：原视频（包含要替换的人脸）。 */
  inputs: VideoInputs & {
    referenceVideo: MediaRef
  }
}

// ---- F14 动作迁移 ----

/**
 * F14 动作迁移请求。
 * 将视频中人物的动作迁移到另一个人物图片上。
 *
 * 对应 API：
 * - 万相 wan2.2-animate-move
 */
export type MotionTransferRequest = MediaGenerateBase & {
  feature: 'avatar-motion-transfer'

  /** 可选：描述/指导。 */
  prompt?: string

  /** 人物输入。 */
  personInputs: PersonInputs & {
    /** 必填：目标人物图片（要做动作的人）。 */
    personImage: MediaRef
    /** 必填：动作参考视频。 */
    drivingVideo: MediaRef
  }

  /** 输出宽高比。默认与 drivingVideo 一致。 */
  aspectRatio?: AspectRatio

  /** 输出时长。默认与 drivingVideo 一致。 */
  duration?: number
}

// ===========================================================================
// 第八层：电商垂直功能请求
// ===========================================================================

// ---- F15 虚拟试衣 ----

/**
 * F15 虚拟试衣请求。
 * 将衣服图片合成到人物图片上。
 *
 * 对应 API：专用虚拟试衣模型。
 */
export type VirtualTryOnRequest = MediaGenerateBase & {
  feature: 'ecommerce-tryon'

  /** 可选：试衣场景/风格描述。 */
  prompt?: string

  /** 人物输入。 */
  personInputs: PersonInputs & {
    /** 必填：人物全身照。 */
    personImage: MediaRef
    /** 必填：衣服图片。 */
    garmentImage: MediaRef
  }

  /**
   * 衣服类别。
   *
   * 后端适配策略：
   * - 模型有品类参数 → 传入
   * - 模型无此参数 → 后端通过图片分类自动识别
   */
  garmentCategory?: 'top' | 'bottom' | 'dress' | 'outerwear' | 'full-body'
}

// ===========================================================================
// 第九层：音频类功能请求
// ===========================================================================

// ---- F16 语音合成 ----

/**
 * F16 语音合成（TTS）请求。
 *
 * 对应 API：
 * - CosyVoice 系列（cosyvoice-v3-flash、cosyvoice-v3.5-plus 等）
 */
export type TTSRequest = MediaGenerateBase & {
  feature: 'audio-tts'

  /** 必填：待合成的文本内容（即 prompt）。 */
  prompt: string

  /**
   * 音色 ID / 预设音色名称。
   * - 预设音色：如 'longxiaochun'、'longshu' 等（CosyVoice 内置）
   * - 复刻音色 ID：用户通过声音复刻功能创建的自定义音色
   *
   * 后端适配策略：
   * - 模型支持的音色 → 直接传入
   * - 音色 ID 无效 → 使用默认音色并在响应中标记
   */
  voiceId?: string

  /** 声音复刻参考音频（用于实时声音复刻，与 voiceId 互斥）。 */
  referenceAudio?: MediaRef

  /**
   * 语速倍率。
   * 范围 0.5-2.0：1.0 = 正常语速。
   *
   * 后端适配策略：
   * - 模型支持语速控制 → 直接传入
   * - 模型不支持 → 后端通过音频后处理调速
   */
  speed?: number

  /**
   * 语言代码（如 'zh-CN'、'en-US'、'ja-JP'）。
   * 不填时根据文本内容自动检测。
   */
  language?: string

  /**
   * 情感/语气标签。
   * 如 'happy'、'sad'、'angry'、'neutral'、'whispering'。
   *
   * 后端适配策略：
   * - 模型支持情感控制 → 传入
   * - 模型不支持 → 后端将情感描述添加到 SSML 标签或忽略
   */
  emotion?: string

  /** 输出音频格式。默认 'mp3'。 */
  audioFormat?: AudioFormat

  /** 输出采样率（Hz）。默认由后端根据模型决定。 */
  sampleRate?: number
}

// ---- F17 音乐生成 ----

/**
 * F17 音乐生成请求。
 *
 * 对应 API：音乐生成模型（如 MusicGen、Suno 等）。
 */
export type MusicGenerateRequest = MediaGenerateBase & {
  feature: 'audio-music'

  /**
   * 音乐描述。
   * 如 "轻快的电子音乐，带有钢琴旋律，适合科技产品宣传"。
   */
  prompt: string

  /**
   * 目标时长（秒）。
   *
   * 后端适配策略：
   * - 模型支持时长控制 → 直接传入
   * - 模型有固定时长选项 → 选择最接近的
   * - 默认值：30
   */
  duration?: number

  /**
   * 音乐流派/风格标签。
   * 如 'electronic'、'classical'、'jazz'、'rock'、'ambient'。
   *
   * 后端适配策略：
   * - 模型有流派参数 → 传入
   * - 模型无此参数 → 融入 prompt
   */
  genre?: string

  /**
   * BPM（每分钟节拍数）。
   * 范围 40-240。
   *
   * 后端适配策略：
   * - 模型支持 BPM 控制 → 传入
   * - 模型不支持 → 融入 prompt（如 "tempo: 120 BPM"）
   */
  bpm?: number

  /**
   * 参考音频（用于风格参考或续写）。
   */
  referenceAudio?: MediaRef

  /**
   * 是否生成纯器乐（无人声）。
   * 默认值：true。
   */
  instrumental?: boolean

  /** 输出音频格式。默认 'mp3'。 */
  audioFormat?: AudioFormat
}

// ---- F18 音效生成 ----

/**
 * F18 音效生成（Sound Effects）请求。
 *
 * 对应 API：音效生成模型（如 AudioGen、Make-An-Audio 等）。
 */
export type SFXGenerateRequest = MediaGenerateBase & {
  feature: 'audio-sfx'

  /**
   * 音效描述。
   * 如 "雨水滴落在金属屋顶上的声音"、"汽车引擎启动"。
   */
  prompt: string

  /**
   * 目标时长（秒）。
   *
   * 后端适配策略：
   * - 模型支持时长控制 → 直接传入
   * - 默认值：5
   */
  duration?: number

  /**
   * 音效分类标签。
   * 如 'nature'、'mechanical'、'human'、'ambient'、'impact'。
   *
   * 后端适配策略：
   * - 有分类参数的模型 → 传入
   * - 无此参数 → 融入 prompt
   */
  category?: string

  /** 输出音频格式。默认 'mp3'。 */
  audioFormat?: AudioFormat
}

// ---- F19 歌声合成 ----

/**
 * F19 歌声合成（Singing Voice Synthesis）请求。
 * 根据歌词（+ 可选曲谱/旋律参考）生成歌声。
 *
 * 对应 API：歌声合成模型（如 DiffSinger、ACE Studio API 等）。
 *
 * 画布连接：
 * - 文本节点 → 歌词输入（prompt）
 * - 音频节点 → 旋律参考 / 伴奏
 */
export type SingingRequest = MediaGenerateBase & {
  feature: 'audio-singing'

  /**
   * 歌词文本。
   * 支持纯文本歌词或带节拍标注的歌词格式。
   * 格式示例：
   * - 纯文本："月亮代表我的心"
   * - 带节拍标注："[verse] 月亮代表我的心 [chorus] 你问我爱你有多深"
   */
  prompt: string

  /**
   * 音色 ID / 预设歌手音色。
   * 与 TTS 的 voiceId 类似，但专用于歌声音色。
   *
   * 后端适配策略：
   * - 模型有对应歌手音色 → 直接传入
   * - 音色不可用 → 使用默认歌手音色并在响应中标记
   */
  voiceId?: string

  /** 声音复刻参考音频（用于自定义歌手音色，与 voiceId 互斥）。 */
  referenceAudio?: MediaRef

  /**
   * 旋律/伴奏参考音频。
   * 提供旋律参考让模型跟随曲调演唱。
   *
   * 后端适配策略：
   * - 模型支持旋律输入 → 传入
   * - 模型不支持 → 后端忽略，仅基于歌词生成
   */
  melodyReference?: MediaRef

  /**
   * 音乐调性。
   * 如 'C major'、'A minor'、'G# minor'。
   *
   * 后端适配策略：
   * - 模型支持调性参数 → 传入
   * - 模型不支持 → 融入 prompt 或忽略
   */
  key?: string

  /**
   * BPM（每分钟节拍数）。
   * 范围 40-240。
   *
   * 后端适配策略：
   * - 模型支持 BPM → 传入
   * - 模型不支持 → 融入 prompt（如 "tempo: 120 BPM"）或后处理调速
   */
  bpm?: number

  /**
   * 语言代码（如 'zh-CN'、'en-US'、'ja-JP'、'ko-KR'）。
   * 不填时根据歌词内容自动检测。
   */
  language?: string

  /**
   * 目标时长（秒）。
   * 不填时由歌词长度和 BPM 自动决定。
   *
   * 后端适配策略：
   * - 模型支持时长控制 → 传入
   * - 模型不支持 → 后端裁剪或循环
   */
  duration?: number

  /** 输出音频格式。默认 'wav'（歌声通常需要更高品质）。 */
  audioFormat?: AudioFormat

  /** 输出采样率（Hz）。默认 44100。 */
  sampleRate?: number
}

// ---- F20 声音复刻 ----

/**
 * F20 声音复刻（Voice Clone）请求。
 * 从参考音频中提取音色特征，创建可复用的自定义音色 ID。
 * 后续 TTS / 歌声合成 / 语音转换可通过该音色 ID 使用。
 *
 * 对应 API：CosyVoice 声音复刻、GPT-SoVITS 等。
 *
 * 注意：此功能的输出不是音频文件，而是一个音色 ID（存储在后端）。
 * outputType 仍标记为 'audio'，但 results 中的 url 字段为空，
 * 音色 ID 通过 results[].metadata.voiceId 返回。
 *
 * 画布连接：
 * - 音频节点 → 参考音频输入（3~30 秒清晰人声录音）
 */
export type VoiceCloneRequest = MediaGenerateBase & {
  feature: 'audio-voice-clone'

  /** 可选：音色名称/描述（如 "小明的声音"、"温柔女声"）。 */
  prompt?: string

  /** 必填：参考音频（3~30 秒的清晰人声录音）。 */
  inputs: AudioInputs & {
    sourceAudio: MediaRef
  }

  /**
   * 自定义音色名称。
   * 用于后续在 UI 中标识和选择此音色。
   *
   * 后端适配策略：
   * - 存储到音色库中，关联生成的音色 ID
   */
  voiceName?: string

  /**
   * 参考音频中的语言（帮助模型更好地提取发音特征）。
   * 不填时自动检测。
   */
  language?: string

  /**
   * 音色特征增强等级。
   * 范围 0-1：0 = 轻度提取（快速但不太精准），1 = 深度提取（慢但更精准）。
   * 默认值：0.7。
   *
   * 后端适配策略：
   * - 模型支持精度等级 → 映射到对应参数
   * - 模型不支持 → 后端忽略
   */
  fidelity?: number
}

// ---- F21 语音转换 ----

/**
 * F21 语音转换（Voice Conversion）请求。
 * 将音频 A 的内容保持不变，替换为目标音色（音频 B）。
 * 类似"换声音"：原始语义/语速/情感保持，只换说话人。
 *
 * 对应 API：So-VITS-SVC、RVC、CosyVoice 声音转换等。
 *
 * 画布连接：
 * - 音频节点（源） → sourceAudio（要转换的原始音频）
 * - 音频节点（目标） → referenceAudio（目标音色参考）或 voiceId
 */
export type VoiceConvertRequest = MediaGenerateBase & {
  feature: 'audio-voice-convert'

  /** 可选：转换指导描述（如 "保持情感但换成男声"）。 */
  prompt?: string

  /** 必填：源音频（要转换的原始音频）。 */
  inputs: AudioInputs & {
    sourceAudio: MediaRef
  }

  /**
   * 目标音色 ID（通过声音复刻创建的，或平台预设音色）。
   * 与 referenceAudio 二选一。
   *
   * 后端适配策略：
   * - 模型支持音色 ID → 直接传入
   * - 音色 ID 无效 → 返回错误
   */
  targetVoiceId?: string

  /**
   * 目标音色参考音频（与 targetVoiceId 互斥）。
   * 用于实时声音转换，不需要预先注册音色。
   *
   * 后端适配策略：
   * - 模型支持实时参考 → 传入参考音频
   * - 模型不支持 → 后端先调用声音复刻注册音色，再执行转换
   */
  referenceAudio?: MediaRef

  /**
   * 转换强度。
   * 范围 0-1：0 = 几乎保持原声（只微调），1 = 完全转换为目标音色。
   * 默认值：0.8。
   *
   * 后端适配策略：
   * - 模型支持强度控制（如 index_rate、protect）→ 映射到对应参数
   * - 模型不支持 → 后端忽略
   */
  convertStrength?: number

  /**
   * 是否保留原始语调变化（pitch contour）。
   * true = 保持原始抑扬顿挫（适合语音），false = 使用目标音色的自然语调。
   * 默认值：true。
   *
   * 后端适配策略：
   * - 模型支持 pitch 保留参数 → 传入
   * - 模型不支持 → 后端忽略
   */
  preservePitch?: boolean

  /** 输出音频格式。默认 'mp3'。 */
  audioFormat?: AudioFormat

  /** 输出采样率（Hz）。默认与源音频一致。 */
  sampleRate?: number
}

// ---- F22 音频降噪/增强 ----

/**
 * F22 音频降噪/增强（Audio Denoise & Enhancement）请求。
 * 去除背景噪音、提升人声清晰度、均衡音频质量。
 *
 * 对应 API：
 * - DeepFilterNet、DTLN 等降噪模型
 * - Adobe Podcast Enhance 类接口
 *
 * 画布连接：
 * - 音频节点 → 嘈杂音频输入
 */
export type AudioDenoiseRequest = MediaGenerateBase & {
  feature: 'audio-denoise'

  /** 可选：降噪指导（如 "去除风噪但保留环境氛围"）。 */
  prompt?: string

  /** 必填：待降噪的源音频。 */
  inputs: AudioInputs & {
    sourceAudio: MediaRef
  }

  /**
   * 降噪模式。
   * - 'speech' → 优化人声，激进降噪（适用于播客/会议录音）
   * - 'music' → 保守降噪，保留音乐细节
   * - 'general' → 通用降噪（默认）
   *
   * 后端适配策略：
   * - 模型有对应模式 → 选择对应模式
   * - 模型无模式参数 → 后端根据模式调整降噪阈值
   */
  mode?: 'speech' | 'music' | 'general'

  /**
   * 降噪强度。
   * 范围 0-1：0 = 轻微降噪（保留更多环境音），1 = 激进降噪（可能导致音质损失）。
   * 默认值：0.7。
   *
   * 后端适配策略：
   * - 模型支持强度参数 → 映射到降噪阈值/灵敏度
   * - 模型不支持 → 后端通过预/后处理调节
   */
  denoiseStrength?: number

  /**
   * 是否启用语音增强（提升人声清晰度、均衡音量）。
   * 在降噪基础上额外做人声增强处理。
   * 默认值：false。
   *
   * 后端适配策略：
   * - 使用支持增强的模型 → 启用增强模式
   * - 模型不支持 → 后端链式处理：先降噪，再用均衡器/压缩器增强
   */
  enhance?: boolean

  /** 输出音频格式。默认与源音频格式一致。 */
  audioFormat?: AudioFormat

  /** 输出采样率（Hz）。默认与源音频一致。 */
  sampleRate?: number
}

// ---- F23 人声分离 ----

/**
 * 人声分离输出轨道类型。
 */
export type SeparationTrack = 'vocals' | 'accompaniment' | 'drums' | 'bass' | 'other'

/**
 * F23 人声分离（Source Separation）请求。
 * 将混合音频分离为多个独立轨道（人声、伴奏、鼓、贝斯等）。
 *
 * 对应 API：
 * - Demucs（Meta）、Spleeter（Deezer）
 * - 各云厂商的音频分离 API
 *
 * 注意：此功能的输出是多个音频文件（每轨一个）。
 * results 数组中每个 item 通过 metadata.track 标识轨道类型。
 *
 * 画布连接：
 * - 音频节点 → 混合音频输入
 * - 输出多个音频节点（每轨一个）
 */
export type AudioSeparateRequest = MediaGenerateBase & {
  feature: 'audio-separate'

  /** 可选：分离指导（如 "重点提取人声"）。 */
  prompt?: string

  /** 必填：待分离的混合音频。 */
  inputs: AudioInputs & {
    sourceAudio: MediaRef
  }

  /**
   * 期望输出的轨道列表。
   * 不填时默认分离为 ['vocals', 'accompaniment']（人声+伴奏）。
   *
   * 后端适配策略：
   * - 模型支持 5 轨分离（如 Demucs htdemucs_ft）→ 按需输出指定轨道
   * - 模型只支持 2 轨分离（人声/伴奏）→ 只输出 vocals 和 accompaniment
   * - 请求 drums/bass/other 但模型不支持 → 后端降级为 2 轨，并在响应中标记
   */
  tracks?: SeparationTrack[]

  /**
   * 分离质量。
   * 与 MediaGenerateBase.quality 语义一致，但此处特指分离精度。
   * - 'draft' → 快速分离（可能有串音）
   * - 'standard' → 标准质量
   * - 'hd' → 最高精度（处理更慢）
   */
  quality?: Quality

  /** 输出音频格式。默认 'wav'（分离轨通常需要无损）。 */
  audioFormat?: AudioFormat

  /** 输出采样率（Hz）。默认与源音频一致。 */
  sampleRate?: number
}

// ---- F24 音频拼接/混音 ----

/**
 * 音频混合子模式。
 */
export type AudioMixMode =
  | 'concatenate'   // 顺序拼接：按序首尾相连
  | 'mix'           // 并行混音：多轨叠加（如人声+背景音乐）
  | 'crossfade'     // 交叉渐变：拼接时加入渐变过渡

/**
 * F24 音频拼接/混音（Audio Mix）请求。
 * 将多段音频合成为一段完整音频。
 *
 * 对应 API：
 * - 主要通过 ffmpeg 后端处理（非 AI 模型，但统一接口）
 * - 高级混音可调用 AI 混音模型
 *
 * 画布连接：
 * - 多个音频节点 → audioTracks（每个连接对应一轨）
 */
export type AudioMixRequest = MediaGenerateBase & {
  feature: 'audio-mix'

  /** 可选：混音指导描述（如 "人声为主，背景音乐压低到30%"）。 */
  prompt?: string

  /** 必填：多轨音频输入。 */
  inputs: AudioInputs & {
    /** 必填：至少两轨音频。 */
    audioTracks: [AudioTrackInput, AudioTrackInput, ...AudioTrackInput[]]
  }

  /**
   * 混合模式。
   * - 'concatenate' → 按 audioTracks 顺序首尾拼接（默认）
   * - 'mix' → 多轨并行叠加，通过各轨的 volume 和 startOffset 控制
   * - 'crossfade' → 顺序拼接，但相邻轨道之间加入渐变过渡
   *
   * 后端适配策略：
   * - concatenate/crossfade → ffmpeg 拼接处理
   * - mix → ffmpeg amix 滤镜或 AI 混音模型
   */
  mode?: AudioMixMode

  /**
   * 交叉渐变时长（秒，仅 'crossfade' 模式）。
   * 相邻两轨之间的渐变过渡时长。
   * 默认值：2.0。
   *
   * 后端适配策略：
   * - 通过 ffmpeg acrossfade 滤镜实现
   */
  crossfadeDuration?: number

  /**
   * 是否启用音量归一化。
   * true → 后端对最终输出做响度归一化（-14 LUFS，流媒体标准）。
   * 默认值：true。
   *
   * 后端适配策略：
   * - 通过 ffmpeg loudnorm 滤镜实现
   */
  normalize?: boolean

  /**
   * 目标总时长（秒）。
   * 不填时由各轨时长自然决定。
   * 填写时：
   * - concatenate：如果拼接结果超长则裁剪尾部，不足则静音填充
   * - mix：超长裁剪，不足静音填充
   *
   * 后端适配策略：
   * - 通过 ffmpeg atrim + apad 实现
   */
  duration?: number

  /** 输出音频格式。默认 'mp3'。 */
  audioFormat?: AudioFormat

  /** 输出采样率（Hz）。默认 44100。 */
  sampleRate?: number

  /**
   * 输出声道数。
   * - 1 = 单声道
   * - 2 = 立体声（默认）
   *
   * 后端适配策略：
   * - 通过 ffmpeg -ac 参数实现
   */
  channels?: 1 | 2
}

// ---- F25 语音识别 (ASR) ----

/**
 * ASR 输出的时间戳粒度。
 */
export type ASRTimestampGranularity = 'none' | 'sentence' | 'word' | 'character'

/**
 * 语音识别结果中的单个片段。
 */
export type ASRSegment = {
  /** 片段文本内容。 */
  text: string
  /** 起始时间（秒）。 */
  startTime: number
  /** 结束时间（秒）。 */
  endTime: number
  /** 置信度（0-1）。 */
  confidence?: number
  /** 说话人标识（如果启用了说话人分离）。 */
  speaker?: string
}

/**
 * F25 语音识别（Automatic Speech Recognition）请求。
 * 将音频转换为文字，支持时间戳和说话人分离。
 *
 * 对应 API：
 * - OpenAI Whisper
 * - 阿里达摩 Paraformer
 * - 各云厂商 ASR 服务
 *
 * 注意：此功能的输出类型为 'text'（非 audio/image/video）。
 * 结果通过 results[].metadata.transcript（完整文本）和
 * results[].metadata.segments（带时间戳的片段）返回。
 *
 * 画布连接：
 * - 音频节点 → 待识别的音频
 * - 输出文本节点（识别结果）
 */
export type ASRRequest = MediaGenerateBase & {
  feature: 'audio-asr'

  /** 可选：识别提示（如领域关键词，帮助提升识别准确率）。 */
  prompt?: string

  /** 必填：待识别的音频。 */
  inputs: AudioInputs & {
    sourceAudio: MediaRef
  }

  /**
   * 音频语言代码（如 'zh-CN'、'en-US'、'ja-JP'）。
   * 不填时自动检测。
   *
   * 后端适配策略：
   * - 模型支持语言参数 → 传入（提升准确率）
   * - 模型不支持 → 依赖模型自动检测
   */
  language?: string

  /**
   * 时间戳粒度。
   * - 'none' → 只返回完整文本（最快）
   * - 'sentence' → 按句子返回时间戳（默认）
   * - 'word' → 按词返回时间戳
   * - 'character' → 按字符返回时间戳（仅部分模型支持）
   *
   * 后端适配策略：
   * - 模型支持指定粒度 → 传入
   * - 模型不支持 word/character → 降级到 sentence
   */
  timestampGranularity?: ASRTimestampGranularity

  /**
   * 是否启用说话人分离（Speaker Diarization）。
   * true → 识别结果中标记每句话的说话人。
   * 默认值：false。
   *
   * 后端适配策略：
   * - 模型支持说话人分离 → 启用
   * - 模型不支持 → 后端忽略，所有内容标记为同一说话人
   */
  diarization?: boolean

  /**
   * 预期说话人数量（启用 diarization 时的提示）。
   * 帮助模型更好地进行说话人聚类。
   *
   * 后端适配策略：
   * - 模型支持 → 传入
   * - 模型不支持 → 忽略，模型自动判断
   */
  speakerCount?: number

  /**
   * 是否添加标点符号。
   * 默认值：true。
   *
   * 后端适配策略：
   * - 模型原生支持 → 传入
   * - 模型不输出标点 → 后端通过文本后处理添加
   */
  punctuation?: boolean

  /**
   * 输出格式。
   * - 'text' → 纯文本（默认）
   * - 'srt' → SRT 字幕格式
   * - 'vtt' → WebVTT 字幕格式
   * - 'json' → 结构化 JSON（包含完整 segments）
   *
   * 后端适配策略：
   * - 后端统一获取结构化结果后，按格式需求转换输出
   */
  outputFormat?: 'text' | 'srt' | 'vtt' | 'json'
}

// ---- F26 音频理解 ----

/**
 * F26 音频理解（Audio Understanding）请求。
 * 分析音频内容，输出描述性文本（内容摘要、情绪、风格、场景等）。
 *
 * 对应 API：
 * - Qwen-Audio、Gemini Audio 理解
 * - 各类音频分析 API
 *
 * 注意：此功能的输出类型为 'text'。
 * 结果通过 results[].metadata.analysis 返回结构化分析结果。
 *
 * 画布连接：
 * - 音频节点 → 待分析的音频
 * - 输出文本节点（分析结果）
 */
export type AudioUnderstandRequest = MediaGenerateBase & {
  feature: 'audio-understand'

  /**
   * 分析指令/问题。
   * 如 "描述这段音频的内容和情绪"、"这段音乐是什么风格？"
   * 不填时返回通用的全面分析。
   */
  prompt?: string

  /** 必填：待分析的音频。 */
  inputs: AudioInputs & {
    sourceAudio: MediaRef
  }

  /**
   * 分析维度。
   * 指定需要分析的方面，不填时全部分析。
   *
   * 后端适配策略：
   * - 模型支持结构化分析 → 按维度查询
   * - 模型只支持自由文本 → 后端将维度要求融入 prompt
   */
  aspects?: AudioAnalysisAspect[]

  /**
   * 输出语言代码（分析结果的语言）。
   * 如 'zh-CN'、'en-US'。不填时与音频语言一致或使用系统语言。
   *
   * 后端适配策略：
   * - 融入 prompt 的语言指令中
   */
  outputLanguage?: string
}

/**
 * 音频分析维度。
 */
export type AudioAnalysisAspect =
  | 'content'     // 内容摘要（说了什么/什么声音）
  | 'emotion'     // 情绪分析（开心/悲伤/愤怒/平静等）
  | 'genre'       // 音乐风格/类型
  | 'instruments' // 乐器识别
  | 'tempo'       // 节奏/BPM 分析
  | 'key'         // 调性分析
  | 'quality'     // 音质评估（信噪比、清晰度等）
  | 'speaker'     // 说话人特征（性别、年龄段、口音等）
  | 'language'    // 语言识别
  | 'scene'       // 场景推断（室内/室外、会议/演唱会等）

// ===========================================================================
// 第十层：联合请求类型 & 响应类型
// ===========================================================================

/**
 * 所有媒体生成请求的联合类型。
 * 后端 API 接收此类型，通过 `feature` 字段进行类型判别和路由。
 */
export type MediaGenerateRequest =
  // 图片类
  | ImageGenerateRequest
  | PosterGenerateRequest
  | InpaintRequest
  | EraseRequest
  | UpscaleRequest
  | OutpaintRequest
  | ImageEditRequest
  | MattingRequest
  // 视频类
  | VideoGenerateRequest
  | VideoEditRequest
  | MotionControlRequest
  // 数字人类
  | LipsyncRequest
  | FaceswapRequest
  | MotionTransferRequest
  // 电商垂直
  | VirtualTryOnRequest
  // 音频类 —— 生成
  | TTSRequest
  | MusicGenerateRequest
  | SFXGenerateRequest
  | SingingRequest
  // 音频类 —— 编辑/处理
  | VoiceCloneRequest
  | VoiceConvertRequest
  | AudioDenoiseRequest
  | AudioSeparateRequest
  | AudioMixRequest
  // 音频类 —— 理解
  | ASRRequest
  | AudioUnderstandRequest

/**
 * 媒体生成任务状态。
 */
export type MediaTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

/**
 * 媒体生成结果的媒体类型。
 * - 'text' 用于理解/识别类功能（ASR、音频理解），输出非媒体文件
 * - 'voiceId' 用于声音复刻，输出为音色 ID 而非媒体文件
 */
export type MediaResultType = 'image' | 'video' | 'audio' | 'text' | 'voiceId'

/**
 * 单个生成结果项。
 * 每次生成可能返回多个结果（count > 1 或模型原生多结果）。
 */
export type MediaResultItem = {
  /** 结果资源的 URL。对于非文件结果（如声音复刻的 voiceId、ASR 文本）可为空。 */
  url: string
  /**
   * 本地保存后的相对路径。
   * 当服务端将结果下载到本地后填充，前端通过此路径加载。
   */
  localPath?: string
  /** 资源宽度（像素，图片/视频）。 */
  width?: number
  /** 资源高度（像素，图片/视频）。 */
  height?: number
  /** 资源时长（秒，视频/音频）。 */
  duration?: number
  /** 文件大小（字节）。 */
  fileSize?: number
  /**
   * 结果元数据（扩展字段）。
   * 不同功能类型的结果可携带不同元数据：
   *
   * - voice-clone: { voiceId: string, voiceName?: string }
   * - audio-separate: { track: SeparationTrack }
   * - audio-asr: { transcript: string, segments?: ASRSegment[], language?: string }
   * - audio-understand: { analysis: Record<AudioAnalysisAspect, string> }
   */
  metadata?: Record<string, unknown>
}

/**
 * 媒体生成任务提交响应。
 */
export type MediaTaskCreatedResponse = {
  success: true
  data: {
    /** 任务 ID，用于后续轮询。 */
    taskId: string
    /**
     * 预估完成时间（秒）。
     * 后端根据模型和任务类型估算，前端用于展示进度条。
     */
    estimatedSeconds?: number
    /**
     * 预估消耗积分。
     * 后端在任务创建时计算，前端用于展示费用。
     */
    estimatedCredits?: number
  }
}

/**
 * 媒体生成任务轮询响应。
 */
export type MediaTaskPollResponse = {
  success: true
  data: {
    /** 任务状态。 */
    status: MediaTaskStatus
    /** 任务进度（0-100）。 */
    progress?: number
    /** 结果媒体类型。 */
    resultType?: MediaResultType
    /** 生成结果列表（成功时填充）。 */
    results?: MediaResultItem[]
    /**
     * 结果 URL 列表（向后兼容，与 results[].url 对应）。
     * @deprecated 优先使用 results 字段。
     */
    resultUrls?: string[]
    /** 错误信息（失败时填充）。 */
    error?: {
      /** 错误码。 */
      code?: string
      /** 错误描述。 */
      message: string
    }
    /** 实际消耗积分（完成后填充）。 */
    consumedCredits?: number
    /** 后端实际使用的 seed（可复现场景使用）。 */
    actualSeed?: number
  }
}

/**
 * 媒体 API 错误响应。
 */
export type MediaErrorResponse = {
  success: false
  /** 错误码（用于程序化处理）。 */
  code: string
  /** 错误描述（用于用户展示）。 */
  message: string
}

/**
 * 媒体 API 统一响应类型。
 */
export type MediaApiResponse =
  | MediaTaskCreatedResponse
  | MediaTaskPollResponse
  | MediaErrorResponse

// ===========================================================================
// 第十一层：功能元数据 & 分类工具类型
// ===========================================================================

/**
 * 功能所属的大类。
 * 用于 UI 分组展示和后端路由。
 */
export type MediaFeatureCategory = 'image' | 'video' | 'avatar' | 'ecommerce' | 'audio'

/**
 * 功能的输出媒体类型。
 * 标识该功能生成的结果是什么类型的媒体。
 * - 'text' → 理解/识别类功能的输出（ASR、音频理解）
 * - 'voiceId' → 声音复刻的输出（非媒体文件，而是音色标识）
 */
export type MediaFeatureOutputType = 'image' | 'video' | 'audio' | 'text' | 'voiceId'

/**
 * 功能元数据描述。
 * 用于 UI 展示功能列表和前端能力检测。
 */
export type MediaFeatureMeta = {
  /** 功能标识符。 */
  feature: MediaFeature
  /** 功能所属大类。 */
  category: MediaFeatureCategory
  /** 输出媒体类型。 */
  outputType: MediaFeatureOutputType
  /** 是否需要文本输入（prompt 是否为必填）。 */
  requiresPrompt: boolean
  /** 是否需要媒体输入（图片/视频/音频）。 */
  requiresMediaInput: boolean
  /** 支持的最大生成数量。 */
  maxCount: number
  /** 是否支持 aspectRatio 参数。 */
  supportsAspectRatio: boolean
  /** 是否支持 resolution 参数。 */
  supportsResolution: boolean
  /** 是否支持 style 参数。 */
  supportsStyle: boolean
  /** 是否支持 duration 参数（视频/音频）。 */
  supportsDuration: boolean
}

/**
 * 所有功能的元数据映射表。
 *
 * 此常量供前端 UI 使用，用于：
 * - 展示功能列表和分类
 * - 决定 AI 面板中哪些参数控件可见
 * - 前端参数校验
 */
export const MEDIA_FEATURE_META: Record<MediaFeature, MediaFeatureMeta> = {
  // ── 图片类 ──
  'image-generate': {
    feature: 'image-generate',
    category: 'image',
    outputType: 'image',
    requiresPrompt: true,
    requiresMediaInput: false,
    maxCount: 9,
    supportsAspectRatio: true,
    supportsResolution: true,
    supportsStyle: true,
    supportsDuration: false,
  },
  'image-poster': {
    feature: 'image-poster',
    category: 'image',
    outputType: 'image',
    requiresPrompt: true,
    requiresMediaInput: false,
    maxCount: 4,
    supportsAspectRatio: true,
    supportsResolution: true,
    supportsStyle: true,
    supportsDuration: false,
  },
  'image-inpaint': {
    feature: 'image-inpaint',
    category: 'image',
    outputType: 'image',
    requiresPrompt: true,
    requiresMediaInput: true,
    maxCount: 4,
    supportsAspectRatio: false,
    supportsResolution: true,
    supportsStyle: false,
    supportsDuration: false,
  },
  'image-erase': {
    feature: 'image-erase',
    category: 'image',
    outputType: 'image',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'image-upscale': {
    feature: 'image-upscale',
    category: 'image',
    outputType: 'image',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'image-outpaint': {
    feature: 'image-outpaint',
    category: 'image',
    outputType: 'image',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 4,
    supportsAspectRatio: true,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'image-edit': {
    feature: 'image-edit',
    category: 'image',
    outputType: 'image',
    requiresPrompt: true,
    requiresMediaInput: true,
    maxCount: 4,
    supportsAspectRatio: false,
    supportsResolution: true,
    supportsStyle: true,
    supportsDuration: false,
  },
  'image-matting': {
    feature: 'image-matting',
    category: 'image',
    outputType: 'image',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  // ── 视频类 ──
  'video-generate': {
    feature: 'video-generate',
    category: 'video',
    outputType: 'video',
    requiresPrompt: true,
    requiresMediaInput: false,
    maxCount: 4,
    supportsAspectRatio: true,
    supportsResolution: false,
    supportsStyle: true,
    supportsDuration: true,
  },
  'video-edit': {
    feature: 'video-edit',
    category: 'video',
    outputType: 'video',
    requiresPrompt: true,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: true,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: true,
  },
  'video-motion': {
    feature: 'video-motion',
    category: 'video',
    outputType: 'video',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 4,
    supportsAspectRatio: true,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: true,
  },
  // ── 数字人类 ──
  'avatar-lipsync': {
    feature: 'avatar-lipsync',
    category: 'avatar',
    outputType: 'video',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: true,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: true,
  },
  'avatar-faceswap': {
    feature: 'avatar-faceswap',
    category: 'avatar',
    outputType: 'video',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'avatar-motion-transfer': {
    feature: 'avatar-motion-transfer',
    category: 'avatar',
    outputType: 'video',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: true,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: true,
  },
  // ── 电商垂直 ──
  'ecommerce-tryon': {
    feature: 'ecommerce-tryon',
    category: 'ecommerce',
    outputType: 'image',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 4,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  // ── 音频类 ──
  'audio-tts': {
    feature: 'audio-tts',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: true,
    requiresMediaInput: false,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'audio-music': {
    feature: 'audio-music',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: true,
    requiresMediaInput: false,
    maxCount: 4,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: true,
    supportsDuration: true,
  },
  'audio-sfx': {
    feature: 'audio-sfx',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: true,
    requiresMediaInput: false,
    maxCount: 4,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: true,
  },
  'audio-singing': {
    feature: 'audio-singing',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: true,
    requiresMediaInput: false,
    maxCount: 4,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: true,
    supportsDuration: true,
  },
  'audio-voice-clone': {
    feature: 'audio-voice-clone',
    category: 'audio',
    outputType: 'voiceId',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'audio-voice-convert': {
    feature: 'audio-voice-convert',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'audio-denoise': {
    feature: 'audio-denoise',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'audio-separate': {
    feature: 'audio-separate',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'audio-mix': {
    feature: 'audio-mix',
    category: 'audio',
    outputType: 'audio',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: true,
  },
  'audio-asr': {
    feature: 'audio-asr',
    category: 'audio',
    outputType: 'text',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
  'audio-understand': {
    feature: 'audio-understand',
    category: 'audio',
    outputType: 'text',
    requiresPrompt: false,
    requiresMediaInput: true,
    maxCount: 1,
    supportsAspectRatio: false,
    supportsResolution: false,
    supportsStyle: false,
    supportsDuration: false,
  },
}

// ===========================================================================
// 第十二层：提交上下文（OpenLoaf 内部使用）
// ===========================================================================

/**
 * 媒体任务提交的本地上下文。
 * 不发送给 SaaS 后端，仅用于 OpenLoaf 服务端的资产管理和画布追踪。
 */
export type MediaSubmitContext = {
  /** 项目 ID，用于存储路径定位。 */
  projectId?: string
  /** 保存目录（相对于项目根目录，如 ".openloaf/boards/board_xxx/asset"）。 */
  saveDir?: string
  /** 来源节点 ID，用于画布追踪。 */
  sourceNodeId?: string
}

/**
 * 完整的媒体任务提交负载。
 * = 通用请求 + 本地上下文
 */
export type MediaSubmitPayload = MediaGenerateRequest & MediaSubmitContext
