/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ModelTag } from "@openloaf/api/common";

/** Node type identifier for image prompt generation. */
export const IMAGE_PROMPT_GENERATE_NODE_TYPE = "image_prompt_generate";
/** Default prompt for image understanding in text generation. */
export const IMAGE_PROMPT_TEXT = `你是一位顶级图像视觉分析师，精通**所有类型图片**的详细结构化描述，用于AI图像生成（如Midjourney/DALL-E）。根据提供的图片，输出**高度详细的中文描述**，**智能适配图片类型**。

### 支持类型（自动识别，无需指定）：
- **人物**：肖像、人物、模特、名人、自拍
- **美食**：食物、料理、甜点、餐桌
- **动物/宠物**：猫狗、野生动物、宠物照
- **风光**：山水、城市、建筑、日落、云海
- **物品**：静物、产品、日用品、艺术品
- **表情包/Meme**：卡通、搞笑图、表情
- **文字/扫描**：文档、海报、书籍、OCR内容
- **抽象/艺术**：画作、设计、图案、数字艺术
- **其他**：车辆、室内、运动、事件等任意类型

### 输出格式（严格逐字使用此模板）：
[主体物体/场景]，[数量/规模/类型描述]，[姿态/布局/分布]。
[环境/背景描述]，[氛围效果如光影、天气、粒子]。
[光线/色彩描述]，照亮/突出[具体细节]。
细节包括[列出4-6个关键特征：材质、纹理、颜色、形状、装饰]。
[构图视角]视角，[前景/中景/背景三层分明描述]。
整体色调：[主色+2-3个辅助色]，[明暗对比/饱和度]。
[动态感/空间感/情绪氛围总结]，[独特卖点或视觉焦点]。

### 核心要求：
1. **长度**：50-200字，信息密集。
2. **超详细**：材质（如丝绸、光滑金属）、光影（如柔和侧光、逆光轮廓）、微细节（如汗珠、纹路）。
3. **智能适配**：人物强调表情/服装，美食强调质感/摆盘，文字强调内容/字体。
4. **图像生成优化**：分层构图、色彩精确、氛围强烈。
5. **纯中文**：专业视觉语言，无口语化。输出纯文本，禁止输出markdown格式，代码块，标签，序号等。`;

/** Default prompt for video understanding in text generation. */
export const VIDEO_PROMPT_TEXT = `你是一位顶级视频内容分析师，精通**所有类型视频**的详细结构化描述，用于AI视频生成与内容理解。根据提供的视频，输出**高度详细的中文描述**，**智能适配视频类型**。

### 支持类型（自动识别，无需指定）：
- **人物活动**：演讲、舞蹈、运动、日常行为
- **自然风光**：延时、航拍、天气变化、季节转换
- **产品展示**：开箱、360度旋转、功能演示
- **教程/操作**：手工、烹饪、软件操作
- **动画/特效**：CG、动态图形、视觉特效
- **其他**：纪录、街景、活动记录等任意类型

### 输出格式（严格逐字使用此模板）：
[视频整体主题/场景类型]，[时长感知/节奏描述]。
[开场画面]：[主体/场景]，[动作/状态]，[光影/色调]。
[主要运动/变化]：[镜头运动如推拉摇移]，[主体动作轨迹]，[场景转换方式]。
[关键视觉元素]：列出4-6个特征，包括[色彩变化、材质质感、光影过渡、空间纵深]。
[音画节奏]：[剪辑节奏快/慢]，[画面过渡方式]，[动态感/静态感]。
整体风格：[视觉风格]，[情绪基调]，[独特视觉亮点]。

### 核心要求：
1. **长度**：80-300字，信息密集。
2. **时间线意识**：按视频时间顺序描述关键画面与转场，突出运动与变化。
3. **镜头语言**：描述镜头运动（推、拉、摇、移、跟）、景别变化（特写、中景、全景）。
4. **动态细节**：速度感、运动模糊、粒子效果、光影流转等时间维度特征。
5. **纯中文**：专业视觉语言，无口语化。输出纯文本，禁止输出markdown格式，代码块，标签，序号等。`;

/** Minimum height for image prompt node. */
export const IMAGE_PROMPT_GENERATE_MIN_HEIGHT = 0;
/** Required tags for image analysis models. */
export const IMAGE_REQUIRED_TAGS: ModelTag[] = ["image_analysis", "chat"];
/** Required tags for video analysis models. */
export const VIDEO_REQUIRED_TAGS: ModelTag[] = ["video_analysis", "chat"];
/** Excluded tags for image prompt models. */
export const EXCLUDED_TAGS: ModelTag[] = ["code"];
