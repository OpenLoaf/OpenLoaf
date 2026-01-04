# 通义万相-文生图V2版API参考

通义万相-文生图模型基于文本生成图像，支持多种艺术风格与写实摄影效果，满足多样化创意需求。

**说明**

通义万相官网的功能与API支持的能力可能存在差异。本文档以API的实际能力为准，并会随功能更新及时同步。

## 模型概览

| **模型名称** | **模型简介** | **输出图像格式** |
| --- | --- | --- |
| wan2.6-t2i **推荐** | 万相2.6<br>支持在总像素面积与宽高比约束内，自由选尺寸（同wan2.5） | 图像分辨率：总像素在[768*768, 1440*1440]之间<br>图像宽高比：[1:4, 4:1]<br>图像格式：png |
| wan2.5-t2i-preview **推荐** | 万相2.5 preview<br>支持在总像素面积与宽高比约束内，自由选尺寸<br>例如，支持768*2700，而2.2 及以下版本单边上限 1400 | |
| wan2.2-t2i-flash | 万相2.2极速版<br>较2.1模型速度提升50% | 图像分辨率：宽高均在[512, 1440]像素之间<br>图像格式：png |
| wan2.2-t2i-plus | 万相2.2专业版<br>较2.1模型稳定性与成功率全面提升 | |
| wanx2.1-t2i-turbo | 万相2.1极速版 | |
| wanx2.1-t2i-plus | 万相2.1专业版 | |
| wanx2.0-t2i-turbo | 万相2.0极速版 | |

**说明**

* 调用前，请查阅各地域支持的模型列表。
* wan2.6模型：支持HTTP同步调用、HTTP异步调用，暂不支持SDK调用。
* wan2.5及以下版本模型：支持HTTP异步调用、DashScope SDK调用，不支持HTTP同步调用。

## 前提条件

在调用前，先获取与配置 API Key，再配置API Key到环境变量。如需通过SDK进行调用，请安装DashScope SDK。

**重要**

北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

## HTTP同步调用（wan2.6）

**重要**

本章节接口为新版协议，仅支持 wan2.6模型。

一次请求即可获得结果，流程简单，推荐大多数场景使用。

**北京地域**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

**新加坡地域**：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

### 请求参数

#### 请求头（Headers）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| Content-Type | string | 必选 | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string | 必选 | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

#### 请求体（Request Body）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| model | string | 必选 | 模型名称。示例值：wan2.6-t2i。<br>**说明**：wan2.5及以下版本模型，HTTP调用请参见HTTP异步调用。 |
| input | object | 必选 | 输入的基本信息 |
| input.messages | array | 必选 | 请求内容数组。当前仅支持单轮对话，即传入一组role、content参数，不支持多轮对话。 |
| input.messages[].role | string | 必选 | 消息的角色。此参数必须设置为user。 |
| input.messages[].content | array | 必选 | 消息内容数组 |
| input.messages[].content[].text | string | 必选 | 正向提示词，用于描述期望生成的图像内容、风格和构图。<br>支持中英文，长度不超过2100个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。<br>示例值：一只坐着的橘黄色的猫，表情愉悦，活泼可爱，逼真准确。<br>**注意**：仅支持传入一个text，不传或传入多个将报错。 |
| parameters | object | 可选 | 图像处理参数 |
| parameters.negative_prompt | string | 可选 | 反向提示词，用于描述不希望在图像中出现的内容，对画面进行限制。<br>支持中英文，长度不超过500个字符，超出部分将自动截断。<br>示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 |
| parameters.size | string | 可选 | 输出图像的分辨率，格式为宽*高。<br>默认值为 1280*1280。<br>总像素在 [768*768, 1440*1440] 之间且宽高比范围为 [1:4, 4:1]。例如，768*2700符合要求。<br>示例值：1280*1280。<br><br>**常见比例推荐的分辨率**：<br>- 1:1：1280*1280<br>- 2:3：800*1200<br>- 3:2：1200*800<br>- 3:4：960*1280<br>- 4:3：1280*960<br>- 9:16：720*1280<br>- 16:9：1280*720<br>- 21:9：1344*576 |
| parameters.n | integer | 可选 | **重要**：n直接影响费用。费用 = 单价 × 图片张数，请在调用前确认模型价格。<br>生成图片的数量。取值范围为1~4张，默认为4。<br>**注意**：按张计费，测试建议设为 1。 |
| parameters.prompt_extend | bool | 可选 | 是否开启提示词智能改写。开启后，将使用大模型优化正向提示词，对较短的提示词有明显提升效果，但增加3-4秒耗时。<br>true：默认值，开启智能改写。<br>false：关闭智能改写。 |
| parameters.watermark | bool | 可选 | 是否添加水印标识，水印位于图片右下角，文案固定为"AI生成"。<br>false：默认值，不添加水印。<br>true：添加水印。 |
| parameters.seed | integer | 可选 | 随机数种子，取值范围[0,2147483647]。<br>使用相同的seed参数值可使生成内容保持相对稳定。若不提供，算法将自动使用随机数种子。<br>**注意**：模型生成过程具有概率性，即使使用相同的seed，也不能保证每次生成结果完全一致。 |

### 请求示例

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \\
--header 'Content-Type: application/json' \\
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \\
--data '{
    "model": "wan2.6-t2i",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "prompt_extend": true,
        "watermark": false,
        "n": 1,
        "negative_prompt": "",
        "size": "1280*1280"
    }
}'
```

### 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| output | object | 任务输出信息 |
| output.choices | array | 模型生成的输出内容 |
| output.choices[].finish_reason | string | 任务停止原因，自然停止时为stop |
| output.choices[].message | object | 模型返回的消息 |
| output.choices[].message.role | string | 消息的角色，固定为assistant |
| output.choices[].message.content | array | 消息内容数组 |
| output.choices[].message.content[].image | string | 生成图像的 URL，图像格式为PNG。链接有效期为24小时，请及时下载并保存图像。 |
| output.choices[].message.content[].type | string | 输出的类型，固定为image |
| output.finished | boolean | 任务是否结束。true：已结束。false：未结束。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| usage.image_count | integer | 生成图像的张数 |
| usage.size | string | 生成的图像分辨率。示例值：1280*1280 |
| usage.input_tokens | integer | 输入token。文生图按图片张数计费，当前固定为0 |
| usage.output_tokens | integer | 输出token。文生图按图片张数计费，当前固定为0 |
| usage.total_tokens | integer | 总token。文生图按图片张数计费，当前固定为0 |

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
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxxx.png?Expires=xxx",
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
    "request_id": "815505c6-7c3d-49d7-b197-xxxxx"
}
```

## HTTP异步调用（wan2.6）

**重要**

本章节接口为新版协议，仅支持 wan2.6模型。

适用于对超时敏感的场景。整个流程包含 "创建任务 -> 轮询获取" 两个核心步骤。

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
| X-DashScope-Async | string | 必选 | 异步处理配置参数。HTTP异步调用，必须设置为enable。<br>**重要**：缺少此请求头将报错："current user api does not support synchronous calls"。 |

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
* QPS 限制：查询接口默认QPS为20。如需更高频查询或事件通知，建议配置异步任务回调。

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

**参考文档**：[通义万相-文生图V2版API参考](https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference)

