# 通义千问-文生图API参考

通义千问-文生图模型（Qwen-Image）是一款通用图像生成模型，支持多种艺术风格，尤其擅长**复杂文本渲染**。模型支持多行布局、段落级文本生成以及细粒度细节刻画，可实现复杂的图文混合布局设计。

| **快速入口** | [使用指南](https://help.aliyun.com/zh/model-studio/text-to-image) ｜ [在线体验](https://bailian.console.aliyun.com/?tab=model#/efm/model%5Fexperience%5Fcenter/vision?currentTab=imageGenerate&modelId=qwen-image-plus) ｜ [技术博客](https://qwen.ai/blog?id=9467b4bff9c638e847f08443802c6b96ab116a87&from=research.research-list) |
| --- | --- |

## 前提条件

在调用前，您需要根据地域获取API Key，再配置API Key到环境变量。

**重要**

北京和新加坡地域拥有独立的 **API Key** 与**请求地址**，不可混用，跨地域调用将导致鉴权失败或服务报错。

## 同步接口（推荐）

### HTTP调用

通义千问Qwen-image模型支持同步接口，一次请求即可获得结果，调用流程简单，推荐用于多数场景。

**北京地域**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

**新加坡地域**：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

### 请求参数

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| model | string | 是 | 模型名称，可选值：<br>- qwen-image-plus（推荐）<br>- qwen-image |
| input | object | 是 | 输入内容 |
| input.messages | array | 是 | 消息列表，仅支持单条消息 |
| input.messages[].role | string | 是 | 角色，固定为 "user" |
| input.messages[].content | array | 是 | 消息内容，支持文本输入 |
| input.messages[].content[].text | string | 是 | 文本描述，用于生成图像 |
| parameters | object | 否 | 生成参数 |
| parameters.size | string | 否 | 输出图像尺寸，格式："{width}*{height}"（单位：像素）<br>示例："1024*1024"、"2048*1536"<br>默认值：1024*1024 |
| parameters.negative_prompt | string | 否 | 负面提示词，用于排除不希望出现的元素 |
| parameters.prompt_extend | bool | 否 | 是否启用提示词智能优化<br>默认值：true<br>当输入的prompt比较简洁或希望模型发挥更多创意时，建议保持开启。当prompt已经非常详细、专业，或对API响应延迟有严格要求时，建议显式设置为false |
| parameters.watermark | bool | 否 | 是否添加水印<br>默认值：false |

### 请求示例

#### 文生图

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--data '{
    "model": "qwen-image-plus",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "一副典雅庄重的对联悬挂于厅堂之中，房间是个安静古典的中式布置，桌子上放着一些青花瓷，对联上左书"义本生知人机同道善思新"，右书"通云赋智乾坤启数高志远"， 横批"智启通义"，字体飘逸，在中间挂着一幅中国风的画作，内容是岳阳楼。"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "negative_prompt": "",
        "prompt_extend": true,
        "watermark": false,
        "size": "1328*1328"
    }
}'
```

### 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| request_id | string | 请求ID |
| output | object | 输出内容 |
| output.task_id | string | 任务ID（异步接口返回） |
| output.task_status | string | 任务状态（异步接口返回） |
| output.results | array | 生成结果列表（异步接口返回） |
| output.results[].orig_prompt | string | 原始提示词 |
| output.results[].actual_prompt | string | 实际使用的提示词（启用prompt_extend时） |
| output.results[].url | string | 生成的图片URL（有效期24小时） |
| output.choices | array | 生成结果列表（同步接口返回） |
| output.choices[].finish_reason | string | 完成原因，固定为 "stop" |
| output.choices[].message | object | 消息内容 |
| output.choices[].message.role | string | 角色，固定为 "assistant" |
| output.choices[].message.content | array | 消息内容列表 |
| output.choices[].message.content[].image | string | 生成的图片URL（有效期24小时） |
| usage | object | 使用量信息 |
| usage.image_count | int | 生成的图片数量 |

### 响应示例

#### 同步接口响应

```json
{
    "request_id": "f2153409-3950-9b73-9980-xxxxxx",
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxxx"
                        }
                    ]
                }
            }
        ]
    },
    "usage": {
        "image_count": 1
    }
}
```

#### 异步接口响应

```json
{
    "request_id": "f2153409-3950-9b73-9980-xxxxxx",
    "output": {
        "task_id": "2fc2e1de-0245-442d-b664-xxxxxx",
        "task_status": "SUCCEEDED",
        "results": [
            {
                "orig_prompt": "一副典雅庄重的对联悬挂于厅堂之中，房间是个安静古典的中式布置，桌子上放着一些青花瓷，对联上左书"义本生知人机同道善思新"，右书"通云赋智乾坤启数高志远"， 横批"智启通义"，字体飘逸，在中间挂着一幅中国风的画作，内容是岳阳楼。",
                "actual_prompt": "一副典雅庄重的对联悬挂于中式厅堂中央，对联左侧书写"义本生知人机同道善思新"，右侧书写"通云赋智乾坤启数高志远"，横批为"智启通义"，整体采用飘逸洒脱的书法字体，墨色浓淡相宜，展现出浓厚的传统韵味。对联中间悬挂一幅中国风画作，描绘的是著名的岳阳楼景观：楼阁飞檐翘角，依水而建，远处湖光潋滟，烟波浩渺，天空中有几缕轻云缭绕，营造出诗意盎然的意境。背景房间为安静古典的中式布置，木质家具线条流畅，桌上摆放着数件青花瓷器，纹饰精美，釉色莹润。整体空间光线柔和，营造出庄重、宁静的文化氛围。画面风格为传统中国水墨风，笔触细腻，层次分明，充满古典美感。",
                "url": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxxx"
            }
        ]
    },
    "usage": {
        "image_count": 1
    }
}
```

**注意**：图像链接的有效期为24小时，请及时下载图像。

## 计费与限流

当前qwen-image-plus与qwen-image能力相同，但qwen-image-plus价格更优惠，推荐使用。

### 北京地域

| **模型名称** | **单价** | **限流（主账号与RAM子账号共用）** | **免费额度** |
| --- | --- | --- | --- |
| | **任务下发接口RPS限制** | **同时处理中任务数量** | |
| qwen-image-plus | 0.2元/张 | 2 | 2 | [免费额度](https://help.aliyun.com/zh/model-studio/new-free-quota)：各100张有效期：阿里云百炼开通后90天内 |
| qwen-image | 0.25元/张 | 2 | 2 | |

### 新加坡地域

| **模型名称** | **单价** | **限流（主账号与RAM子账号共用）** | **免费额度** |
| --- | --- | --- | --- |
| | **任务下发接口RPS限制** | **同时处理中任务数量** | |
| qwen-image-plus | 0.220177元/张 | 2 | 2 | 无免费额度 |
| qwen-image | 0.256873元/张 | 2 | 2 | |

**计费规则**

* 计费项：按成功生成的 **图像张数** 计费，采用按量后付费模式。
* 计费公式：**费用 = 计费单价 × 图像张数**。
* 抵扣顺序：优先消耗免费额度。额度用尽后，默认转为按量付费。
  * 您可开启"免费额度用完即停"功能，以避免免费额度耗尽后产生额外费用。详情请参见免费额度。
* 失败不计费：模型调用失败或处理错误不产生任何费用，也不消耗免费额度。

**免费额度**

关于免费额度的领取、查询、使用方法等详情，请参见免费额度。

**调用量查询**

模型调用完约一小时后，请在模型观测页面，查看调用量、调用次数、成功率等指标。

**限流**

模型限流规则及常见问题，请参见限流。

## 图像访问配置

模型生成的图像存储于阿里云OSS，每张图像会被分配一个OSS链接，如`https://dashscope-result-xx.oss-cn-xxxx.aliyuncs.com/xxx.png`。OSS链接允许公开访问，您可以使用此链接查看或者下载图片，链接仅在 24 小时内有效。

特别注意的是，如果您的业务对安全性要求较高，无法访问阿里云OSS链接，您需要单独配置外网访问白名单。请将以下域名添加到您的白名单中，以便顺利访问图片链接。

```
# OSS域名列表
dashscope-result-bj.oss-cn-beijing.aliyuncs.com
dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com
dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com
dashscope-result-zjk.oss-cn-zhangjiakou.aliyuncs.com
dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com
dashscope-result-hy.oss-cn-heyuan.aliyuncs.com
dashscope-result-cd.oss-cn-chengdu.aliyuncs.com
dashscope-result-gz.oss-cn-guangzhou.aliyuncs.com
dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com
```

## 错误码

如果模型调用失败并返回报错信息，请参见错误信息进行解决。

## 常见问题

### Q：prompt_extend参数应该开启还是关闭？

A: 当输入的prompt比较简洁或希望模型发挥更多创意时，建议保持开启（默认）。当prompt已经非常详细、专业，或对API响应延迟有严格要求时，建议显式设置为false。

### Q：qwen-image、qwen-image-plus、qwen-image-edit 等模型的区别是什么？

A：

* **文生图模型：**`qwen-image`与`qwen-image-plus`  
根据文本描述生成图像。当前两者能力相同，但`qwen-image-plus`的价格更优惠，推荐使用。
* **图像编辑模型**：`qwen-image-edit`  
根据输入的图像和文本指令，执行图生图、局部修改等操作，详情请参见通义千问-图像编辑。

---

**参考文档**：[通义千问-文生图API参考](https://help.aliyun.com/zh/model-studio/qwen-image-api)

