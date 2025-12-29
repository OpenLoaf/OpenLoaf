# 通义-文生图-Z-Image API参考

通义-文生图-Z-Image 是一款轻量级文生图模型，可快速生成图像，支持中英文字渲染，并灵活适配多种分辨率与宽高比例。

## 前提条件

您需要获取与配置 API Key，并配置API Key到环境变量。

## HTTP同步调用

**北京地域**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

**新加坡地域**：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

## 请求参数

### 请求头（Headers）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| Content-Type | string | 必选 | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string | 必选 | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

### 请求体（Request Body）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| model | string | 必选 | 模型名称。示例值：z-image-turbo。 |
| input | object | 必选 | 输入的基本信息 |
| input.messages | array | 必选 | 请求内容数组。当前仅支持单轮对话，即传入一组role、content参数，不支持多轮对话。 |
| input.messages[].role | string | 必选 | 消息的角色。此参数必须设置为user。 |
| input.messages[].content | array | 必选 | 消息内容数组。必须包含且仅包含 1 个 text 对象。 |
| input.messages[].content[].text | string | 必选 | 正向提示词用于描述期望生成的图像内容、风格和构图。<br>支持中英文，长度不超过800个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。<br>示例值：一只坐着的橘黄色的猫，表情愉悦，活泼可爱，逼真准确。<br>**注意**：仅支持传入一个text，不传或传入多个将报错。 |
| parameters | object | 可选 | 图像处理参数 |
| parameters.size | string | 可选 | 输出图像的分辨率，格式为宽*高。<br>默认值：1024*1536。<br>总像素范围限制：总像素在 [512*512, 2048*2048]之间。<br>推荐分辨率范围：总像素在 [1024*1024, 1536*1536]之间，出图效果更佳。<br>示例值：1024*1536。 |
| parameters.prompt_extend | bool | 可选 | **重要**：prompt_extend直接影响费用。设为 true 时价格高于 false，具体见模型价格。<br>是否启用智能提示词（text）改写。开启后，将使用大模型优化提示词，并输出思考过程。<br>false：默认值，关闭智能改写。输出图像和原始文本提示词。<br>true：开启智能改写。输出图像、优化后的文本提示词、思考过程。 |
| parameters.seed | integer | 可选 | 随机数种子，取值范围[0,2147483647]。<br>使用相同的seed参数值可使生成内容保持相对稳定。若不提供，算法将自动使用随机数种子。<br>**注意**：模型生成过程具有概率性，即使使用相同的seed，也不能保证每次生成结果完全一致。 |

### 请求示例

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--data '{
    "model": "z-image-turbo",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "一只坐着的橘黄色的猫，表情愉悦，活泼可爱，逼真准确。"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "prompt_extend": false,
        "size": "1120*1440"
    }
}'
```

## 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| request_id | string | 请求唯一标识 |
| output | object | 任务输出信息 |
| output.choices | array | 模型生成的输出内容。此数组仅包含1个元素。 |
| output.choices[].finish_reason | string | 任务停止原因，正常完成时为 stop。 |
| output.choices[].message | object | 模型返回的消息 |
| output.choices[].message.role | string | 消息的角色，固定为assistant。 |
| output.choices[].message.content | array | 消息内容数组 |
| output.choices[].message.content[].image | string | 生成图像的 URL，图像格式为PNG。链接有效期为24小时，请及时下载并保存图像。 |
| output.choices[].message.content[].text | string | 当prompt_extend=false时，为输入的提示词。<br>当prompt_extend=true时，为改写后的提示词。 |
| output.choices[].message.reasoning_content | string | 模型的思考过程，仅在prompt_extend=true时返回思考文本。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| usage.image_count | int | 生成的图片数量 |
| usage.width | int | 图片宽度（像素） |
| usage.height | int | 图片高度（像素） |

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
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx.png?Expires=xxx"
                        },
                        {
                            "text": "优化后的提示词..."
                        }
                    ],
                    "reasoning_content": "",
                    "role": "assistant"
                }
            }
        ]
    },
    "usage": {
        "height": 1536,
        "image_count": 1,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "width": 1024
    },
    "request_id": "abf1645b-b630-433a-92f6-xxxxxx"
}
```

## 模型概览

| **模型名称** | **模型简介** | **输出图像规格** |
| --- | --- | --- |
| z-image-turbo | 轻量模型，快速生图 | 图像分辨率：总像素在[512*512, 2048*2048]之间，推荐分辨率请参见size参数设置<br>图像格式：png<br>图像张数：固定1张 |

**说明**

调用前，请查阅各地域支持的模型列表。

## 错误码

如果模型调用失败并返回报错信息，请参见错误信息进行解决。

---

**参考文档**：[通义-文生图-Z-Image API参考](https://help.aliyun.com/zh/model-studio/z-image-api-reference)
