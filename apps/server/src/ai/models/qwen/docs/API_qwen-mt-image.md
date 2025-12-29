# 通义千问-图像翻译API参考

通义千问-图像翻译模型（Qwen-MT-Image）可精准翻译图像中的文字，并保留原始排版。该模型还支持领域提示、敏感词过滤、术语干预等自定义功能。

**重要**

本文档仅适用于"中国大陆（北京）"地域，且必须使用该地域的API Key。

## 模型概览

### 支持的语种

图像翻译功能支持中/英文与其他语种之间的互译，但不支持在非中/英语种之间直接翻译（例如，从日语翻译为韩语）。

支持的语种包括：中文、英文、日文、韩语、西班牙语、法语等。

### 模型与价格

| **模型名称** | **计费单价** | **限流（主账号与RAM子账号共用）** | **免费额度** |
| --- | --- | --- | --- |
| | **任务下发接口RPS限制** | **同时处理中任务数量** | |
| qwen-mt-image | 0.003元/张 | 1 | 2 | 100张<br>有效期：百炼开通后90天内 |

**计费规则**

* 计费方式：按成功生成的图像张数计费，当任务成功 (task_status 为 SUCCEEDED) 并成功生成图像后，会计费。
* **注意**：如果图像中无可翻译文本，或在启用主体识别功能后，非主体部分无文字时，任务仍会成功并正常计费，此时接口会返回No text detected for translation的提示。
* 模型调用失败或处理错误不产生任何费用，也不消耗免费额度。
* 您可开启"免费额度用完即停"功能，以避免免费额度耗尽后产生额外费用。详情请参见免费额度。

## HTTP调用

您需要已获取API Key并配置API Key到环境变量。

**接口地址**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis`

由于图像翻译耗时较长，HTTP API 采用异步模式，调用流程分两步：

1. **创建任务获取任务ID**：发送一个请求创建任务，该请求会返回任务ID（task_id）。
2. **根据任务ID查询结果**：使用task_id轮询任务状态，直到任务完成并获得图像URL。

## 步骤1：创建任务获取任务ID

**说明**

创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

### 请求参数

#### 请求头（Headers）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| Content-Type | string | 必选 | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string | 必选 | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Async | string | 必选 | 异步处理配置参数。HTTP请求只支持异步，必须设置为enable。<br>**重要**：缺少此请求头将报错："current user api does not support synchronous calls"。 |

#### 请求体（Request Body）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| model | string | 必选 | 模型名称，需要设置为qwen-mt-image。 |
| input | object | 必选 | 输入参数对象 |
| input.image_url | string | 必选 | 图像的公网可访问的URL，支持 HTTP 或 HTTPS 协议。<br>**格式限制**：JPG、JPEG、PNG、BMP、PNM、PPM、TIFF、WEBP<br>**尺寸限制**：图像的宽度和高度均需在15-8192像素范围内，宽高比在1:10至10:1范围内。<br>**大小限制**：不超过10MB<br>**注意**：URL地址若包含中文等非ASCII字符，需进行URL编码后再传入。 |
| input.source_lang | string | 必选 | 源语种。<br>支持值：语种全称、语种编码或auto（自动检测），对大小写不敏感<br>限制：与target_lang不同，且至少有一项为中文或英文<br>示例：Chinese、en、auto |
| input.target_lang | string | 必选 | 目标语种。<br>支持值：语种全称或语种编码，对大小写不敏感<br>限制：与source_lang不同，且至少有一项为中文或英文<br>示例：Chinese、en |
| input.ext | object | 可选 | 可选拓展字段 |
| input.ext.domainHint | string | 可选 | 领域提示，为使译文风格更贴合特定领域，可以使用英文描述使用场景、译文风格等需求。<br>为确保翻译效果，建议不超过200个英文单词。<br>**重要**：领域提示语句当前只支持英文。 |
| input.ext.sensitives | array | 可选 | 配置敏感词，以在翻译前过滤图片中完全匹配的文本，对大小写敏感。<br>敏感词的语种可与源语种不一致，支持全部的源语种和目标语种。为确保翻译效果，建议单次请求添加的敏感词不超过50个。<br>示例：["全场9折", "七天无理由退换"] |
| input.ext.terminologies | array | 可选 | 术语干预，为特定术语设定译文，以满足特定领域的翻译需求，术语对的语种需要与source_lang和target_lang对应。<br>每个术语对象包含：<br>- src (string, 必选)：术语的源文本，语种需要与源语种source_lang一致。<br>- tgt (string, 必选)：术语的目标文本，语种需要与目标语种target_lang一致。<br>示例：[{"src": "应用程序接口", "tgt": "API"}, {"src": "机器学习", "tgt": "ML"}] |
| input.ext.config | object | 可选 | 配置对象 |
| input.ext.config.skipImgSegment | bool | 可选 | 用于控制是否跳过主体检测，翻译图像中主体（如人物、商品、Logo）上的文字。<br>false：默认值，进行主体检测，不翻译主体上的文字。<br>true: 不进行主体检测，将图像主体上的文字一并翻译。 |

### 请求示例

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis' \
--header 'X-DashScope-Async: enable' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
    "model": "qwen-mt-image",
    "input": {
        "image_url": "https://example.com/image.jpg",
        "source_lang": "zh",
        "target_lang": "en"
    }
}'
```

### 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| output | object | 任务输出信息 |
| output.task_id | string | 任务ID。查询有效期24小时。 |
| output.task_status | string | 任务状态。<br>枚举值：<br>- PENDING：任务排队中<br>- RUNNING：任务处理中<br>- SUCCEEDED：任务执行成功<br>- FAILED：任务执行失败<br>- CANCELED：任务已取消<br>- UNKNOWN：任务不存在或状态未知 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数。 |

### 响应示例

```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

## 步骤2：根据任务ID查询结果

**接口地址**：`GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}`

**说明**

* 模型处理耗时约15秒。建议采用轮询机制，并设置合理的查询间隔（如5秒）来获取结果。
* task_id 有效期为24小时，若ID不存在或已过期，任务状态将返回 UNKNOWN。
* 任务成功后返回的 url有效期为24小时，请及时下载并保存图像。
* 此查询接口的默认QPS为1。如需更高频次的查询或事件通知，请配置异步任务回调。
* 如需批量查询或取消任务，请参见管理异步任务。

### 请求参数

#### 请求头（Headers）

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| Authorization | string | 必选 | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

#### URL路径参数

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| task_id | string | 必选 | 任务ID。 |

### 请求示例

```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

### 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| request_id | string | 请求唯一标识 |
| output | object | 任务输出信息 |
| output.task_id | string | 任务ID |
| output.task_status | string | 任务状态 |
| output.submit_time | string | 任务提交时间 |
| output.scheduled_time | string | 任务调度时间 |
| output.end_time | string | 任务结束时间 |
| output.image_url | string | 翻译后的图像URL（有效期24小时） |
| usage | object | 使用量信息 |
| usage.image_count | int | 生成的图片数量 |

### 响应示例

```json
{
    "request_id": "5fec62eb-bf94-91f8-b9f4-f7f758e4e27e",
    "output": {
        "task_id": "72c52225-8444-4cab-ad0c-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-08-13 18:11:16.954",
        "scheduled_time": "2025-08-13 18:11:17.003",
        "end_time": "2025-08-13 18:11:23.860",
        "image_url": "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx?Expires=xxx"
    },
    "usage": {
        "image_count": 1
    }
}
```

## 错误码

如果模型调用失败并返回报错信息，请参见错误信息进行解决。

---

**参考文档**：[通义千问-图像翻译API参考](https://help.aliyun.com/zh/model-studio/qwen-mt-image-api)
