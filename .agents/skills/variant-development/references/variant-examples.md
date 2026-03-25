# Variant 注册完整示例

## 生成类：文生图（最简单）

```typescript
'OL-IG-001': {
  featureId: 'imageGenerate',
  component: ImgGenTextVariant,
  isApplicable: (ctx) => !ctx.hasImage,   // 空节点时可见
  acceptsInputTypes: ['text'],
  producesOutputType: 'image',
  slots: [
    { key: 'prompt', accept: 'text', source: 'pool', label: 'slot.prompt',
      min: 0, max: 1, referenceMode: 'inline' },
  ],
  params: [
    { key: 'promptExtend', type: 'boolean', label: 'params.promptExtend',
      default: true, group: 'primary' },
    { key: 'aspectRatio', type: 'select', label: 'params.aspectRatio',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
      ],
      display: 'pills', default: 'auto', group: 'primary' },
    { key: 'negativePrompt', type: 'text', label: 'params.negativePrompt',
      default: '', group: 'advanced', multiline: true },
  ],
  maxCount: 4,
  supportsSeed: true,
}
```

## 加工类：图片超清（self slot）

```typescript
'OL-UP-001': {
  featureId: 'upscale',
  component: UpscaleQwenVariant,
  isApplicable: (ctx) => ctx.nodeHasImage,  // 节点自身有图才可见
  acceptsInputTypes: ['image'],
  producesOutputType: 'image',
  slots: [
    // self slot — 自动绑定节点自身图片，不渲染 UI
    { key: 'image', accept: 'image', source: 'self', hidden: true,
      label: 'slot.sourceImage', min: 1, max: 1 },
  ],
  params: [
    { key: 'scale', type: 'select', label: 'params.scale',
      options: [
        { value: '4K', label: '4K' },
        { value: '8K', label: '8K' },
      ],
      display: 'pills', default: '4K', group: 'primary' },
  ],
}
```

## 加工类：图片修复（self + paint）

```typescript
'OL-IP-001': {
  featureId: 'imageInpaint',
  component: ImgInpaintVolcVariant,
  isApplicable: (ctx) => ctx.nodeHasImage,  // 需要节点自身图片来画遮罩
  acceptsInputTypes: ['image'],
  producesOutputType: 'image',
  maskPaint: true,      // 启用遮罩绘制
  maskRequired: true,   // 必须画遮罩才能生成
  slots: [
    { key: 'image', accept: 'image', source: 'self', hidden: true,
      label: 'slot.sourceImage', min: 1, max: 1 },
    { key: 'mask', accept: 'image', source: 'paint',
      label: 'slot.mask', min: 1, max: 1 },
    { key: 'prompt', accept: 'text', source: 'pool',
      label: 'slot.prompt', min: 0, max: 1, referenceMode: 'inline' },
  ],
}
```

## 生成类：图生视频（视频节点上，从上游取图）

```typescript
'OL-VG-001': {
  featureId: 'videoGenerate',
  component: VidGenQwenVariant,
  isApplicable: (ctx) => ctx.hasImage,    // 上游有图即可，不需要视频节点自身有内容
  acceptsInputTypes: ['image', 'audio'],
  producesOutputType: 'video',
  slots: [
    { key: 'prompt', accept: 'text', source: 'pool',
      label: 'slot.prompt', min: 0, max: 1, referenceMode: 'inline' },
    { key: 'startFrame', accept: 'image', source: 'pool',  // pool！从上游取图
      label: 'slot.startFrame', min: 1, max: 1 },
    { key: 'audio', accept: 'audio', source: 'pool',
      label: 'slot.audio', min: 0, max: 1 },
  ],
  params: [
    { key: 'duration', type: 'select', label: 'v3.fields.duration',
      options: [{ value: 5, label: '5s' }, { value: 10, label: '10s' }],
      display: 'pills', default: 5, group: 'primary' },
  ],
}
```

## 加工类：视频换脸（视频节点自身 + 上游人脸图）

```typescript
'OL-FS-001': {
  featureId: 'videoFaceSwap',
  component: FaceSwapQwenVariant,
  isApplicable: (ctx) => ctx.nodeHasVideo && ctx.hasImage,  // 节点自身有视频 + 上游有图
  acceptsInputTypes: ['image', 'video'],
  producesOutputType: 'video',
  slots: [
    { key: 'video', accept: 'video', source: 'self', hidden: true,  // self 取节点自身视频
      label: 'slot.video', min: 1, max: 1 },
    { key: 'face', accept: 'image', source: 'pool',                 // pool 取上游人脸图
      label: 'slot.face', min: 1, max: 1 },
  ],
  params: [
    { key: 'mode', type: 'select', label: 'v3.fields.mode',
      options: [
        { value: 'wan-std', label: 'Standard' },
        { value: 'wan-pro', label: 'Pro' },
      ],
      display: 'pills', default: 'wan-std', group: 'primary' },
  ],
}
```

## 加工类：语音识别（音频节点自身）

```typescript
'OL-SR-001': {
  featureId: 'speechToText',
  component: SpeechToTextVariant,
  isApplicable: (ctx) => ctx.nodeHasAudio,  // 节点自身有音频
  acceptsInputTypes: ['audio'],
  producesOutputType: 'text',               // 输出是文本！
  slots: [
    { key: 'audio', accept: 'audio', source: 'self', hidden: true,
      label: 'slot.audio', min: 1, max: 1 },
  ],
  params: [
    { key: 'enableItn', type: 'boolean', label: 'params.enableItn',
      default: true, group: 'primary' },
  ],
}
```

## 高级：mergeInputs（合并多个 slot）

```typescript
'OL-IE-001': {
  featureId: 'imageEdit',
  isApplicable: (ctx) => ctx.nodeHasImage,
  producesOutputType: 'image',
  maskPaint: true,
  slots: [
    { key: 'selfImage', accept: 'image', source: 'self', hidden: true,
      label: 'slot.sourceImage', min: 1, max: 1 },
    { key: 'mask', accept: 'image', source: 'paint',
      label: 'slot.mask', min: 0, max: 1 },
    { key: 'prompt', accept: 'text', source: 'pool',
      label: 'slot.prompt', min: 1, max: 1, referenceMode: 'inline' },
    { key: 'images', accept: 'image', source: 'pool',
      label: 'slot.referenceImages', min: 0, max: 2 },
  ],
  // selfImage 和 images 合并为 API 的 images 字段
  mergeInputs: { images: ['selfImage', 'images'] },
}
```

## 纯声明式 Variant（无 component）

当 variant 不需要自定义 UI 时，可以省略 `component`。面板会自动使用 `GenericVariantForm` 渲染 params：

```typescript
'OL-NEW-001': {
  featureId: 'someFeature',
  // 不写 component — GenericVariantForm 自动渲染
  isApplicable: (ctx) => ctx.nodeHasImage,
  acceptsInputTypes: ['image'],
  producesOutputType: 'image',
  slots: [
    { key: 'image', accept: 'image', source: 'self', hidden: true, min: 1, max: 1 },
  ],
  params: [
    { key: 'strength', type: 'slider', label: 'params.strength',
      min: 0, max: 1, step: 0.1, default: 0.5, group: 'primary' },
  ],
}
```
