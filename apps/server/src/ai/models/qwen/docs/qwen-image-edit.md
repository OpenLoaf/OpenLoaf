# 通义千问-图像编辑API参考

## 模型概览

通义千问-图像编辑模型（qwen-image-edit-plus）支持多图输入和多图输出，可精确修改图内文字、增删或移动物体、改变主体动作、迁移图片风格及增强画面细节。

| **快速入口** | [使用指南](https://help.aliyun.com/zh/model-studio/qwen-image-edit-guide) \| [技术博客](https://qwen.ai/blog?id=1675c295dc29dd31073e5b3f72876e9d684e41c6&from=research.research-list) | [在线体验](https://bailian.console.aliyun.com/?tab=model#/efm/model%5Fexperience%5Fcenter/vision?currentTab=imageGenerate&modelId=qwen-image-edit) |
| --- | --- | --- |

| **模型名称** | **模型简介** | **输出图像规格** |
| --- | --- | --- |
| qwen-image-edit-plus**推荐**<br>当前与qwen-image-edit-plus-2025-10-30能力相同 | qwen-image-edit-plus系列模型，支持单图编辑和多图融合。可输出 **1-6** 张图片。支持自定义分辨率。支持提示词智能优化**。** | **格式**：PNG<br>**分辨率**：<br>**可指定**：通过 [parameters.size](#parameterssize) 参数指定输出图像的宽\*高（单位：像素）。<br>**默认（不指定时）**：总像素接近 1024\*1024，宽高比与输入图（多图输入时为最后一张）一致。 |
| qwen-image-edit-plus-2025-12-15 **推荐** | | |
| qwen-image-edit-plus-2025-10-30 **推荐** | | |
| qwen-image-edit | 支持单图编辑和多图融合。仅支持输出 1 张图片。不支持自定义分辨率。 | **格式**：PNG<br>**分辨率**：<br>**不可指定**。生成规则同上方的**默认**规则。 |

**说明**

调用前，请查阅各地域支持的模型列表与价格。

**计费说明：**

* 按成功生成的 **图像张数** 计费（单次请求如果返回n张图片，则当次费用为 n×单价）。模型调用失败或处理错误不产生任何费用，也不消耗免费额度。
* 您可开启"免费额度用完即停"功能，以避免免费额度耗尽后产生额外费用。详情请参见免费额度。

## HTTP调用

在调用前，您需要获取与配置 API Key，再配置API Key到环境变量。

如需通过SDK进行调用，请安装DashScope SDK。目前，该SDK已支持Python和Java。

**重要**

北京和新加坡地域拥有独立的 **API Key** 与**请求地址**，不可混用，跨地域调用将导致鉴权失败或服务报错。

**北京地域**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

**新加坡地域**：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

### 请求参数

| 参数名 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| model | string | 是 | 模型名称，可选值：<br>- qwen-image-edit-plus<br>- qwen-image-edit-plus-2025-12-15<br>- qwen-image-edit-plus-2025-10-30<br>- qwen-image-edit |
| input | object | 是 | 输入内容 |
| input.messages | array | 是 | 消息列表，仅支持单条消息 |
| input.messages[].role | string | 是 | 角色，固定为 "user" |
| input.messages[].content | array | 是 | 消息内容，支持图片和文本混合输入 |
| input.messages[].content[].image | string | 可选 | 图片URL或Base64编码（格式：data:image/{format};base64,{base64_data}） |
| input.messages[].content[].text | string | 可选 | 文本描述，用于指导图像编辑 |
| parameters | object | 否 | 生成参数 |
| parameters.n | int | 否 | 生成图片数量，取值范围：1-6<br>默认值：1<br>注意：qwen-image-edit 模型仅支持 n=1 |
| parameters.size | string | 否 | 输出图像尺寸，格式："{width}x{height}"（单位：像素）<br>示例："1024x1024"、"2048x1536"<br>注意：仅 qwen-image-edit-plus 系列模型支持此参数 |
| parameters.negative_prompt | string | 否 | 负面提示词，用于排除不希望出现的元素 |
| parameters.prompt_extend | bool | 否 | 是否启用提示词智能优化<br>默认值：false<br>注意：仅 qwen-image-edit-plus 系列模型支持此参数 |
| parameters.watermark | bool | 否 | 是否添加水印<br>默认值：false |

### 请求示例

#### 单图编辑

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--data '{
    "model": "qwen-image-edit-plus",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "image": "https://example.com/image.jpg"
                    },
                    {
                        "text": "生成一张符合深度图的图像，遵循以下描述：一辆红色的破旧的自行车停在一条泥泞的小路上，背景是茂密的原始森林"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "n": 2,
        "negative_prompt": "低质量",
        "prompt_extend": true,
        "watermark": false
    }
}'
```

#### 多图融合

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--data '{
    "model": "qwen-image-edit-plus",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "image": "https://example.com/image1.jpg"
                    },
                    {
                        "image": "https://example.com/image2.jpg"
                    },
                    {
                        "image": "https://example.com/image3.jpg"
                    },
                    {
                        "text": "图1中的女孩穿着图2中的黑色裙子按图3的姿势坐下"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "n": 2,
        "size": "1024x1024",
        "negative_prompt": "低质量",
        "prompt_extend": true,
        "watermark": false
    }
}'
```

### 响应参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| requestId | string | 请求ID |
| usage | object | 使用量信息 |
| usage.image_count | int | 生成的图片数量 |
| usage.width | int | 图片宽度（像素） |
| usage.height | int | 图片高度（像素） |
| output | object | 输出内容 |
| output.choices | array | 生成结果列表 |
| output.choices[].finish_reason | string | 完成原因，固定为 "stop" |
| output.choices[].message | object | 消息内容 |
| output.choices[].message.role | string | 角色，固定为 "assistant" |
| output.choices[].message.content | array | 消息内容列表 |
| output.choices[].message.content[].image | string | 生成的图片URL（有效期24小时） |

### 响应示例

```json
{
    "requestId": "46281da9-9e02-941c-ac78-be88b8xxxxxx",
    "usage": {
        "image_count": 2,
        "width": 1216,
        "height": 864
    },
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        },
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        }
                    ]
                }
            }
        ]
    }
}
```

**注意**：图像链接的有效期为24小时，请及时下载图像。

## 图像访问权限配置

模型生成的图像存储于阿里云OSS，每张图像会被分配一个OSS链接，如`https://dashscope-result-xx.oss-cn-xxxx.aliyuncs.com/xxx.png`。OSS链接允许公开访问，可以使用此链接查看或者下载图片，链接仅在 24 小时内有效。

如果您的业务对安全性要求较高，无法访问阿里云OSS链接，则需要单独配置外网访问白名单。请将以下域名添加到您的白名单中，以便顺利访问图片链接。

```
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

## SDK调用示例

### Python SDK

```python
from dashscope import MultiModalConversation

def call():
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "image": "https://example.com/image.jpg"
                },
                {
                    "text": "生成一张符合深度图的图像，遵循以下描述：一辆红色的破旧的自行车停在一条泥泞的小路上，背景是茂密的原始森林"
                }
            ]
        }
    ]
    
    response = MultiModalConversation.call(
        model="qwen-image-edit-plus",
        messages=messages,
        n=2,
        negative_prompt="低质量",
        prompt_extend=True,
        watermark=False
    )
    
    if response.status_code == 200:
        content_list = response.output.choices[0].message.content
        image_index = 1
        for content in content_list:
            if "image" in content:
                print(f"输出图像{image_index}的URL：{content['image']}")
                image_index += 1
    else:
        print(f"请求失败：{response.message}")

if __name__ == "__main__":
    call()
```

### Java SDK

```java
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.JsonUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

public class QwenImageEditExample {
    public static void call() throws ApiException, NoApiKeyException, UploadFileException, IOException {
        MultiModalConversationParam param = new MultiModalConversationParam();
        param.setModel("qwen-image-edit-plus");
        
        Message userMsg = new Message();
        userMsg.setRole(Role.USER);
        
        List<Map<String, Object>> contentList = new ArrayList<>();
        Map<String, Object> imageContent = new java.util.HashMap<>();
        imageContent.put("image", "https://example.com/image.jpg");
        contentList.add(imageContent);
        
        Map<String, Object> textContent = new java.util.HashMap<>();
        textContent.put("text", "生成一张符合深度图的图像，遵循以下描述：一辆红色的破旧的自行车停在一条泥泞的小路上，背景是茂密的原始森林");
        contentList.add(textContent);
        
        userMsg.setContent(contentList);
        param.setMessages(List.of(userMsg));
        param.setN(2);
        param.setNegativePrompt("低质量");
        param.setPromptExtend(true);
        param.setWatermark(false);
        
        MultiModalConversation result = MultiModalConversation.call(param);
        System.out.println(JsonUtils.toJson(result));
        
        List<Map<String, Object>> resultContentList = result.getOutput().getChoices().get(0).getMessage().getContent();
        int imageIndex = 1;
        for (Map<String, Object> content : resultContentList) {
            if (content.containsKey("image")) {
                System.out.println("输出图像" + imageIndex + "的URL：" + content.get("image"));
                imageIndex++;
            }
        }
    }
    
    public static void main(String[] args) {
        try {
            call();
        } catch (ApiException | NoApiKeyException | UploadFileException | IOException e) {
            System.out.println(e.getMessage());
        }
    }
}
```

## 错误码

如果模型调用失败并返回报错信息，请参见错误信息进行解决。

## 常见问题

#### Q：qwen-image-edit 支持多轮对话式编辑吗？

A：不支持。模型仅支持单轮执行。每次调用均为独立、无状态的任务。如需连续编辑，须将生成的图片作为新输入再次调用。

#### Q：qwen-image-edit 和 qwen-image-edit-plus 系列模型支持哪些语言？

A：目前正式支持**简体中文和英文**；其他语言可自行尝试，但效果未经充分验证，可能存在不确定性。

#### Q：上传多张不同比例的参考图时，输出图像的比例以哪张为准？

A：输出图像会以**最后一张**上传的参考图的比例为准。

#### Q：如何查看模型调用量？

A：模型的调用信息存在小时级延迟，在模型调用完一小时后，请在模型观测（北京或新加坡）页面，查看调用量、调用次数、成功率等指标。详情请参见如何查看模型调用记录。

---

**参考文档**：[通义千问-图像编辑API参考](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)

