# 通义万相-图像生成与编辑2.6 API参考

通义万相图像生成模型支持图像编辑、图文混排输出，满足多样化生成与集成需求。

## 模型概览

| **模型名称** | **模型简介** | **输出图像规格** |
| --- | --- | --- |
| wan2.6-image | 万相2.6 image<br>支持图像编辑和图文混排输出 | 图片格式：PNG。<br>图像分辨率和尺寸请参见size参数。 |

**说明**

调用前，请查阅各地域支持的模型列表与价格。

## 前提条件

您需要已获取与配置 API Key并配置API Key到环境变量。

**重要**

北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

## HTTP同步调用

一次请求即可获得结果，流程简单，推荐大多数场景使用。

**北京地域**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

**新加坡地域**：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

### 请求参数

#### 请求头（Headers）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| Content-Type | string | 必选 | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string | 必选 | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Sse | string | 可选 | 用于启用流式输出。<br>仅当 parameters.enable_interleave=true 时，必须将该字段设为 enable。<br>其他情况下可不传或忽略。 |

#### 请求体（Request Body）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| model | string | 必选 | 模型名称。示例值：wan2.6-image。 |
| input | object | 必选 | 输入的基本信息 |
| input.messages | array | 必选 | 请求内容数组。当前仅支持单轮对话，即传入一组role、content参数，不支持多轮对话。 |
| input.messages[].role | string | 必选 | 消息的角色。此参数固定设置为user。 |
| input.messages[].content | array | 必选 | 消息内容数组 |
| input.messages[].content[].text | string | 必选 | 正向提示词用于描述您期望生成的图像内容、风格和构图。<br>支持中英文，长度不超过2000个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。<br>示例值：参考这个风格的图片，生成番茄炒蛋。<br>**注意**：仅支持传入一个text，不传或传入多个将报错。 |
| input.messages[].content[].image | string | 可选 | 输入图像的URL或Base64编码字符串。<br><br>**图像限制**：<br>- 图像格式：JPEG、JPG、PNG（不支持透明通道）、BMP、WEBP<br>- 图像分辨率：图像的宽高范围均为[384, 5000]像素<br>- 文件大小：不超过10MB<br><br>**图像数量限制**：<br>- 当enable_interleave=true时（图文混排输出），可输入0~1张图像<br>- 当enable_interleave=false时（图像编辑），必须输入1~4张图像<br>- 当输入多张图像时，需在content数组中传入多个image对象，并按照数组顺序定义图像顺序<br><br>**支持的输入格式**：<br>- 使用公网可访问URL：支持 HTTP 或 HTTPS 协议<br>- 传入 Base64 编码图像后的字符串：格式为 data:{MIME_type};base64,{base64_data} |
| parameters | object | 可选 | 图像处理参数 |
| parameters.negative_prompt | string | 可选 | 反向提示词，用于描述不希望在图像中出现的内容，对画面进行限制。<br>支持中英文，长度不超过500个字符，超出部分将自动截断。<br>示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 |
| parameters.size | string | 可选 | 输出图像的分辨率，格式为宽*高。<br>wan2.6-image：总像素在 [768*768, 1280*1280] （即589824 至 1638400像素）之间，且宽高比范围为 [1:4, 4:1]。例如，768*2700符合要求。<br>示例值：1280*1280。<br><br>**常见比例推荐的分辨率**：<br>- 1:1：1280*1280 或 1024*1024<br>- 2:3：800*1200<br>- 3:2：1200*800<br>- 3:4：960*1280<br>- 4:3：1280*960<br>- 9:16：720*1280<br>- 16:9：1280*720<br>- 21:9：1344*576<br><br>**输出图像尺寸的规则**：<br>- 方式一：指定 size 参数：输出图像严格按 size 指定的宽高生成<br>- 方式二：未指定 size：输出图像由总像素上限和宽高比规则共同决定 |
| parameters.enable_interleave | bool | 可选 | 控制生图模式：<br>false：默认值，表示图像编辑模式（支持多图输入及主体一致性生成）<br>- 用途：基于1～4张输入图像进行编辑、风格迁移或主体一致性生成<br>- 输入：必须提供至少1张参考图像<br>- 输出：可生成1至4张结果图像<br><br>true：表示启用图文混排输出模式（仅支持传入一张图像或不传图像）<br>- 用途：根据文本描述生成图文并茂的内容，或进行纯文本生成图像（文生图）<br>- 输入：可以不提供图像（文生图），或提供最多1张参考图像<br>- 输出：固定生成1个包含文本和图像的混合内容块 |
| parameters.n | integer | 可选 | **重要**：n直接影响费用。费用 = 单价 × 成功生成的图片张数，请在调用前确认模型价格。<br>指定生成图片的数量。该参数的取值范围与含义取决于 enable_interleave（模式开关）的状态：<br>- 当 enable_interleave=false（图像编辑模式）：作用：直接控制生成图像的数量。取值范围：1～4，默认值为 4。建议在测试阶段将此值设置为 1，以便低成本验证效果<br>- 当 enable_interleave=true（图文混排模式）：限制：此参数默认为1，且必须固定为1。若设置为其他值，接口将报错。说明：在此模式下，如需控制生成图像的数量上限，请使用 max_images 参数 |
| parameters.max_images | integer | 可选 | **重要**：max_images影响费用。费用 = 单价 × 成功生成的图片张数，请在调用前确认模型价格。<br>仅在图文混排模式（即 enable_interleave=true）下生效。<br>作用：指定模型在单次回复中生成图像的最大数量。<br>取值范围：1～5，默认值为 5。<br>**注意**：该参数仅代表"数量上限"。实际生成的图像数量由模型推理决定，可能会少于设定值（例如：设置为 5，模型可能根据内容仅生成 3 张）。 |
| parameters.prompt_extend | bool | 可选 | 仅在图像编辑模式（即enable_interleave = false）下生效。<br>是否开启 Prompt（提示词）智能改写功能。该功能仅对正向提示词进行优化与润色，不会改变负向提示词。<br>true：默认值，开启智能改写。<br>false：关闭智能改写，使用原始提示词。 |
| parameters.stream | bool | 可选 | 仅在图像混排模式（即 enable_interleave = true）下生效。<br>控制返回结果是否为流式输出。<br>false：默认值，非流式输出。<br>true：流式输出。 |
| parameters.watermark | bool | 可选 | 是否添加水印标识，水印位于图片右下角，文案固定为"AI生成"。<br>false：默认值，不添加水印。<br>true：添加水印。 |
| parameters.seed | integer | 可选 | 随机数种子，取值范围[0,2147483647]。<br>使用相同的seed参数值可使生成内容保持相对稳定。若不提供，算法将自动使用随机数种子。<br>**注意**：模型生成过程具有概率性，即使使用相同的seed，也不能保证每次生成结果完全一致。 |

### 请求示例

#### 图像编辑

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \\
--header 'Content-Type: application/json' \\
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \\
--data '{
    "model": "wan2.6-image",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "参考图1的风格和图2的背景，生成番茄炒蛋"
                    },
                    {
                        "image": "https://cdn.wanx.aliyuncs.com/tmp/pressure/umbrella1.png"
                    },
                    {
                        "image": "https://img.alicdn.com/imgextra/i3/O1CN01SfG4J41UYn9WNt4X1_!!6000000002530-49-tps-1696-960.webp"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "prompt_extend": true,
        "watermark": false,
        "n": 1,
        "enable_interleave": false,
        "size": "1280*1280"
    }
}'
```

#### 图文混排（仅支持流式）

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \\
--header 'Content-Type: application/json' \\
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \\
--header 'X-DashScope-Sse: enable' \\
--data '{
    "model": "wan2.6-image",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "生成一篇关于人工智能的文章，包含相关图片"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "enable_interleave": true,
        "stream": true,
        "max_images": 3
    }
}'
```

### 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| output | object | 任务输出信息 |
| output.choices | array | 模型生成的输出内容 |
| output.choices[].finish_reason | string | 任务停止原因。<br>非流式输出场景：自然停止时为stop。<br>流式输出场景：传输过程中前序数据包会持续返回 "finish_reason": "null"，仅在最后一个 JSON 结构体中返回 "finish_reason":"stop" |
| output.choices[].message | object | 模型返回的消息 |
| output.choices[].message.role | string | 消息的角色，固定为assistant |
| output.choices[].message.content | array | 消息内容数组 |
| output.choices[].message.content[].type | string | 输出的类型，枚举值为text、image |
| output.choices[].message.content[].text | string | 生成的文字（图文混排模式） |
| output.choices[].message.content[].image | string | 生成图像的 URL，图像格式为PNG。链接有效期为24小时，请及时下载并保存图像。 |
| output.finished | bool | 请求结束标志符。true：表示请求结束。false：表示请求未结束。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| usage.image_count | integer | 生成图像的张数 |
| usage.size | string | 生成的图像分辨率。示例值：1328*1328 |
| usage.input_tokens | integer | 输入token数量。按图片张数计费，当前固定为0 |
| usage.output_tokens | integer | 输出token数量。按图片张数计费，当前固定为0 |
| usage.total_tokens | integer | 总token数量。按图片张数计费，当前固定为0 |

### 响应示例

```json
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": [
                        {
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx.png?Expires=xxx",
                            "type": "image"
                        }
                    ],
                    "role": "assistant"
                }
            }
        ],
        "finished": true
    },
    "usage": {
        "image_count": 1,
        "input_tokens": 0,
        "output_tokens": 0,
        "size": "1280*1280",
        "total_tokens": 0
    },
    "request_id": "a3f4befe-cacd-49c9-8298-xxxxxx"
}
```

## HTTP异步调用

由于图像生成任务耗时较长（通常为1-2分钟），API采用异步调用以避免请求超时。整个流程包含 "创建任务 -> 轮询获取" 两个核心步骤。

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### 步骤1：创建任务获取任务ID

**北京地域**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation`

**新加坡地域**：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image-generation/generation`

**说明**

创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

#### 请求参数

**请求头（Headers）**

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| Content-Type | string | 必选 | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string | 必选 | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Async | string | 必选 | 异步处理配置参数。HTTP异步调用，必须设置为enable。 |

**请求体（Request Body）**

与同步调用相同，参考上方同步调用的请求体参数。

#### 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| request_id | string | 请求唯一标识 |
| output | object | 任务输出信息 |
| output.task_id | string | 任务ID。查询有效期24小时。 |
| output.task_status | string | 任务状态。<br>枚举值：<br>- PENDING：任务排队中<br>- RUNNING：任务处理中<br>- SUCCEEDED：任务执行成功<br>- FAILED：任务执行失败<br>- CANCELED：任务已取消<br>- UNKNOWN：任务不存在或状态未知 |

### 步骤2：根据任务ID查询结果

**北京地域**：`GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}`

**新加坡地域**：`GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}`

**说明**

* 轮询建议：图像生成过程约需数分钟，建议采用轮询机制，并设置合理的查询间隔（如 10 秒）来获取结果。
* 任务状态流转：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
* 结果链接：任务成功后返回图像链接，有效期为 24 小时。建议在获取链接后立即下载并转存至永久存储（如阿里云 OSS）。

#### 请求参数

**请求头（Headers）**

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| Authorization | string | 必选 | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

**URL路径参数**

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| task_id | string | 必选 | 任务ID |

#### 响应参数

与同步调用响应类似，但包含task_status、submit_time、scheduled_time、end_time等异步任务相关字段。

## 错误码

如果模型调用失败并返回报错信息，请参见错误信息进行解决。

---

**参考文档**：[通义万相-图像生成与编辑2.6 API参考](https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference)

