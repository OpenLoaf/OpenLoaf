# 通义千问 Qwen 模型列表（导航总览）

> 本文是对百炼控制台文档中 **模型列表** 页的一个本地导航整理，便于在代码仓库中快速了解 Qwen 能力的大类与入口。详细的、可实时更新的模型清单与价格，请以百炼控制台文档为准：
>
> - 模型列表文档入口：`https://bailian.console.aliyun.com/?tab=doc#/doc/?type=model&url=2840914`

## 顶层能力分类

- **文本生成**
  - 文本生成模型概述
  - 多轮对话
  - 流式输出
  - 深度思考
  - 结构化输出
  - 前缀续写
  - 上下文缓存
  - 批量推理
  - 工具调用
  - 专项模型

- **多模态**
  - 视觉理解
  - 视觉推理
  - 文字提取
  - 界面交互

- **音频 / 语音**
  - 音频理解
  - 全模态、实时多模态
  - 语音合成（实时语音合成-CosyVoice/Sambert、实时语音合成-通义千问、语音合成-通义千问）
  - 语音识别（实时语音识别-Fun-ASR/Gummy/Paraformer、实时语音识别-通义千问、录音文件识别-Fun-ASR/Paraformer/SenseVoice、录音文件识别-通义千问）
  - 语音翻译（实时语音翻译-Gummy、实时音视频翻译-通义千问、音视频翻译-通义千问）

- **图像生成 / 编辑**
  - 文本生成图像
  - 图像编辑
  - 人像风格重绘
  - 图像背景生成
  - 图像画面扩展
  - 虚拟模特生成（含鞋靴模特）
  - 创意海报生成
  - 人物实例分割
  - 图像擦除补全
  - 图像局部重绘
  - 涂鸦作画

- **视频生成**
  - 文生视频 / 图生视频 等相关模型

- **向量化**
  - 文本与多模态向量化

## 相关配套能力

- **接入客户端 / 开发工具**
  - Chatbox、Cherry Studio、Claude Code、Qwen Code、Cline、Dify、Postman 等

- **模型调优 / 部署 / 评测**
  - 文本生成模型调优、视频生成模型调优
  - 使用 API 进行模型部署
  - 模型评测、模型用量与监控

- **数据与安全**
  - 模型数据：训练集与评测集、数据清洗或增强
  - 安全合规：权限管理、传输安全、安全存储、内容审核、应用合规备案、隐私说明

## 实践与教程

- 文生文 / 文生图 / 文生视频 Prompt 指南
- 基于 LlamaIndex 构建 RAG 应用
- 10 分钟构建主动提问的智能导购
- 用 Assistant API 构建 Multi-Agent
- 自定义模型最佳实践
- 借助大模型将文档转换为视频

---

**说明**：具体到每个模型（如 `qwen-image-plus`、`qwen-mt-image`、`z-image-turbo`、`wan2.6-t2i`、`wan2.6-image` 等）的参数与计费，在本仓库中分别对应以下文档：

- `API_qwen-image.md` – 通义千问-文生图 API 参考（[官方文档](https://help.aliyun.com/zh/model-studio/qwen-image-api)）
- `qwen-image-edit.md` / `API_qwen-image-edit-plus.md` – 通义千问-图像编辑 API 参考（[官方文档](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)）
- `API_qwen-mt-image.md` – 通义千问-图像翻译 API 参考（[官方文档](https://help.aliyun.com/zh/model-studio/qwen-mt-image-api)）
- `API_z-image.md` – 通义文生图 Z-Image API 参考（[官方文档](https://help.aliyun.com/zh/model-studio/z-image-api-reference)）
- `API_text-to-image-v2.md` – 通义万相 2.x 文生图 V2 API 参考（[官方文档](https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference)）
- `API_wan-image-generation.md` – 通义万相-图像生成与编辑 2.6 API 参考（[官方文档](https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference)）


