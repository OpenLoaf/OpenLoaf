<span id="0OyQN9w2"></span>
# 接口简介
即梦视频3.0Pro —— 即梦同源的文生视频与图生视频能力，在视频生成效果上实现飞跃，各维度均表现优异。该版本具备**多镜头叙事能力**，能更**精准遵循指令**，**动态表现流畅自然**，支持生成**1080P高清**且具专业级质感的视频，还可实现更丰富多元的风格化表达。
即梦视频3.0Pro支持功能含：

* **文生视频：** 输入文本提示词，生成视频；
* **图生视频\-首帧：** 输入首帧图片和对应的文本提示词，生成视频。

&nbsp;
<span id="obyhNcNN"></span>
# 接入说明
<span id="x8DsbTjJ"></span>
## 请求说明

|名称 |内容 |
|---|---|
|接口地址 |[https://visual.volcengineapi.com](https://visual.volcengineapi.com/) |
|请求方式 |POST |
|Content\-Type |application/json |

<span id="3KggAzew"></span>
## 提交任务
<span id="f5d8azoz"></span>
### **提交任务请求参数**
<span id="1pehRvGl"></span>
#### **Query参数**
:::tip 拼接到url后的参数，示例：[https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31](https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31)

:::
|参数 |类型 |**可选/必选** |说明 |
|---|---|---|---|
|Action |string |必选 |接口名，取值：**CVSync2AsyncSubmitTask** |
|Version |string |必选 |版本号，取值：2022\-08\-31 |

<span id="GZfCefM6"></span>
#### **Header参数**
:::warning
本服务固定值：**Region为cn\-north\-1，Service为cv**
:::
主要用于鉴权，详见 [公共参数](https://www.volcengine.com/docs/6369/67268) \- 签名参数 \- 在Header中的场景部分
<span id="3ExOfPfN"></span>
#### **Body参数**
:::warning
业务请求参数，放到request.body中，MIME\-Type为**application/json**

:::
|参数 |类型 |**可选/必选** |说明 |
|---|---|---|---|
|req_key |string |必选 |服务标识|\
| | | |取固定值: **jimeng_ti2v_v30_pro** |
|prompt |string |可选|用于生成视频的提示词 ，中英文均可输入。建议在400字以内，不超过800字，prompt过长有概率出现效果异常或不生效 |\
| | || |\
| | |* 文生视频场景必选 | |
|binary_data_base64 |array of string |可选|图片文件base64编码，仅支持输入1张图片（图生视频仅支持传入首帧），仅支持JPEG、PNG格式；|\
| | ||注意：|\
| | |* 图生视频场景图片和prompt二选一必选||\
| | |* 传图时binary_data_base64和image_urls参数二选一 |* 图片文件大小：最大 4.7MB|\
| | | |* 图片分辨率：最大 4096 \* 4096，最短边不低于320；|\
| | | |* 图片长边与短边比例在3以内； |
|image_urls |^^|^^|图片文件URL，仅支持输入1张图片（图生视频仅支持传入首帧）|\
| | | |注意：|\
| | | ||\
| | | |* 图片长边与短边比例在3以内； |
|seed |int |可选 |随机种子，作为确定扩散初始状态的基础，默认\-1（随机）。若随机种子为相同正整数且其他参数均一致，则生成视频极大概率效果一致|\
| | | |默认值：\-1 |
|frames |int |可选 |生成的总帧数（帧数 = 24 \* n + 1，其中n为秒数，支持5s、10s）|\
| | | |可选取值：[121, 241]|\
| | | |默认值：121 |
|aspect_ratio |string |可选 |生成视频的长宽比，只在文生视频场景下生效，图生视频场景会根据输入图的长宽比从可选取值中选择最接近的比例生成；|\
| | | |可选取值：["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]|\
| | | |默认值："16:9"|\
| | | |&nbsp;|\
| | | |生成视频长宽与比例的对应关系如下：|\
| | | ||\
| | | |* 2176 \* 928（21:9）|\
| | | |* 1920 \* 1088（16:9）|\
| | | |* 1664 \* 1248（4:3）|\
| | | |* 1440 \* 1440 （1:1）|\
| | | |* 1248 \* 1664（3:4）|\
| | | |* 1088 \* 1920（9:16） |

<span id="eozh1inS"></span>
### 图片裁剪规则

<span id="4jhFRRNN"></span>
### 
图生视频场景，当传入的图片与可选的取值["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]的宽高比不一致时，系统会对图片进行裁剪，裁剪时会居中裁剪，详细规则如下：
:::tip
如果希望呈现较好的视频效果，建议上传图片宽高比与可选的宽高比取值["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]尽可能接近。

:::
1. 输入参数：
   * 输入图片宽度记为<span data-label="purple">W</span>，高度记为<span data-label="purple">H</span>。
   * 假设输入图片最接近的目标比例记为<span data-label="purple">A:B</span>（例如：16:9），则裁剪后的宽度与高度之比应为<span data-label="purple">A:B</span>。
2. 比较宽高比：
   * 计算输入图片的宽高比<span data-label="purple">Ratio_原始=W/H</span>。
   * 计算目标比例的比值<span data-label="purple">Ratio_目标=A/B</span>。
   * 根据比较结果，决策裁剪基准：
      * 如果<span data-label="purple">Ratio_原始 < Ratio_目标</span>(即传入图片“太高”或“竖高”)，则以宽度为基准裁剪。
      * 如果<span data-label="purple">Ratio_原始 \> Ratio_目标</span>(即传入图片“太宽”或“横宽”)，则以高度为基准裁剪。
      * 如果相等，则无需裁剪，直接使用全图。
3. 裁剪尺寸计算：
   * 以宽度为基准（适用于传入图片“太高”或“竖高”场景）：
      * 裁剪宽度<span data-label="purple">Crop_W=W</span>（使用输入图片原始宽度）。
      * 裁剪高度<span data-label="purple">Crop_H=W\*(B/A)</span>（根据目标比例等比例计算高度）。
      * 裁剪区域的起始坐标（居中定位）：
         * X坐标（水平）：总是0（因为宽度全用，从左侧开始）。
         * Y坐标（垂直）：<span data-label="purple">(H\-Crop_H)/2</span>（确保垂直居中，从顶部开始）。
   * 以高度为基准（适用于传入图片“太宽”或“横宽”）：
      * 裁剪高度<span data-label="purple">Crop_H=H</span>（使用整个原始高度）。
      * 裁剪宽度<span data-label="purple">Crop_W=H\*(A/B)</span>（根据目标比例等比例计算宽度）。
      * 裁剪区域的起始坐标（居中定位）：
         * X坐标（水平）：<span data-label="purple">(W\-Crop_W)/2</span>（确保水平居中，从左侧开始）。
         * Y坐标（垂直）：总是0（因为高度全用，从顶部开始）。
4. 裁剪结果：
   * 最终裁剪出的图片尺寸为<span data-label="purple">Crop_W\*Crop_H</span>，比例严格等于<span data-label="purple">A:B</span>，且完全位于原始图片内部，无黑边。
   * 裁剪区域总是以原始图片中心为基准，因此内容居中。
5. 裁剪示例：


|输入图片 |生成的视频结果 |
|---|---|
|* 输入图片宽高：3380\*1072|<video src="https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_0df4f3e742648d2860e44ed45cb2bc87.mp4" controls></video>|\
|* 与输入图片接近的宽高比：21:9| |\
|| |\
|<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_b04ff44f251ef30500662b9b633cb482.png) </span>| |\
| | |
|* 输入图片宽高：936\*1664|<video src="https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_8c9d7e04b0b0a17697c8b48e28d239f1.mp4" controls></video>|\
|* 与输入图片接近的宽高比：9:16||\
||&nbsp;|\
|<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_9b34efbbfb01e4032ac692bb57e59c17.png =271x) </span> |&nbsp;|\
| | |



<span id="lG0x6urQ"></span>
### 提交任务返回参数
<span id="BcLqo9tO"></span>
#### **通用返回参数**
请参考[通用返回字段及错误码](https://www.volcengine.com/docs/6444/69728)
<span id="8XkrcJlq"></span>
#### **业务返回参数**
:::tip 重点关注data中以下字段，其他字段为公共返回(可忽略或不做解析)

:::
|字段 |类型 |说明 |
|---|---|---|
|task_id |string |任务ID，用于查询结果 |

<span id="RIDLPrTD"></span>
### 提交任务请求&返回完整示例
**请求示例：** 
```JSON
{
    "req_key": "jimeng_ti2v_v30_pro",
    // "binary_data_base64": [],
    "image_urls": [
        "https://xxx"
    ],
    "prompt": "千军万马",
    "seed": -1,
    "frames": 121,
    "aspect_ratio": "16:9"
}
```

**返回示例：** 
```JSON
{
    "code": 10000, //状态码，判断状态，code!=10000的情况下，不会返回task_id
    "data": {
        "task_id": "7392616336519610409" //任务ID，查询接口使用
    },
    "message": "Success",
    "request_id": "20240720103939AF0029465CF6A74E51EC", //排查错误的关键信息
    "time_elapsed": "104.852309ms" //链路耗时
}
```

<span id="2Qe4Tp56"></span>
## 查询任务
<span id="Pq06oeAc"></span>
### **查询任务请求参数**
<span id="UNhAm8Jd"></span>
#### **Query参数**
:::tip 拼接到url后的参数，示例：[https://visual.volcengineapi.com](https://visual.volcengineapi.com/)[?Action=CVSync2AsyncGetResult&Version=2022-08-31](https://visual.volcengineapi.com?Action=CVGetResult&Version=2022-08-31)

:::
|参数 |类型 |**可选/必选** |说明 |
|---|---|---|---|
|Action |string |必选 |接口名，固定值：**CVSync2AsyncGetResult** |
|Version |string |必选 |版本号，固定值：**2022\-08\-31** |

<span id="0B2SArFY"></span>
#### **Header参数**
:::warning
本服务固定值：**Region为cn\-north\-1，Service为cv**
:::
主要用于鉴权，详见 [公共参数](https://www.volcengine.com/docs/6369/67268) \- 签名参数 \- 在Header中的场景部分
<span id="5wwgvpXD"></span>
#### **Body参数**
:::warning
业务请求参数，放到request.body中，MIME\-Type为**application/json**

:::
|参数 |类型 |**可选/必选** |说明 | |
|---|---|---|---|---|
|req_key |String |必选 |服务标识| |\
| | | |取固定值: **jimeng_ti2v_v30_pro** | |
|task_id |String |必选 |任务ID，此字段的取值为**提交任务接口**的返回 | |
|req_json |JSON String |可选 |json序列化后的字符串,目前支持隐性水印配置，可在返回结果中添加 |示例："{\"aigc_meta\": {\"content_producer\": \"xxxxxx\", \"producer_id\": \"xxxxxx\", \"content_propagator\": \"xxxxxx\", \"propagate_id\": \"xxxxxx\"}}" |

<span id="dHqY6NdR"></span>
##### **ReqJson(序列化后的结果再赋值给req_json)** 
配置信息

|**参数** |**类型** |**可选/必选** |**说明** | |
|---|---|---|---|---|
|aigc_meta |AIGCMeta |可选 |隐式标识 |隐式标识验证方式：|\
| | | | ||\
| | | | |https://www.gcmark.com/web/index.html#/mark/check/video|\
| | | | |   验证，先注册帐号 上传打标后的视频 点击开始检测 输出检测结果如下图即代表成功|\
| | | | ||\
| | | | |<div style="text-align: center">|\
| | | | |<img src="https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_37d8115b3de900fec9b697787ea51d86.png" width="2362px" /></div>|\
| | | | | |

<span id="MbPVqd33"></span>
##### AIGCMeta
隐式标识，依据《人工智能生成合成内容标识办法》&《网络安全技术人工智能生成合成内容标识方法》

|名称 |类型 |**可选/必选** |描述 |
|---|---|---|---|
|content_producer |string |可选 |内容生成服务ID（长度 <= 256字符） |
|producer_id |string |必选 |内容生成服务商给此图片数据的唯一ID（长度 <= 256字符） |
|content_propagator |string |必选 |内容传播服务商ID（长度 <= 256字符） |
|propagate_id |string |可选 |传播服务商给此图片数据的唯一ID（长度 <= 256字符） |

<span id="baxETG51"></span>
### 查询任务返回参数
<span id="O7rmT4WK"></span>
#### **通用返回参数**
请参考[通用返回字段及错误码](https://www.volcengine.com/docs/6444/69728)
<span id="HJEK9xnP"></span>
#### **业务返回参数**
:::tip
重点关注data中以下字段，其他字段为公共返回(可忽略或不做解析)

:::
|参数名 |类型 | |
|---|---|---|
|video_url |string |生成的视频URL（有效期为 1 小时） |
|aigc_meta_tagged |bool |隐式标识是否打标成功 |
|status |string |任务执行状态|\
| | ||\
| | |* in_queue：任务已提交|\
| | |* generating：任务已被消费，处理中|\
| | |* done：处理完成，成功或者失败，可根据外层code&message进行判断|\
| | |* not_found：任务未找到，可能原因是无此任务或任务已过期(12小时)|\
| | |* expired：任务已过期，请尝试重新提交任务请求 |

<span id="2RRktTMN"></span>
### 查询任务请求&返回完整示例
**请求示例：** 
```JSON
{
    "req_key": "jimeng_ti2v_v30_pro",
    "task_id": "7491596536074305586",
    "req_json": "{\"aigc_meta\": {\"content_producer\": \"001191440300192203821610000\", \"producer_id\": \"producer_id_test123\", \"content_propagator\": \"001191440300192203821610000\", \"propagate_id\": \"propagate_id_test123\"}}"
}
```

**返回示例：** 
```JSON
{
    "code": 10000, //状态码，优先判断 code=10000, 然后再判断data.status，否则解析有可能会panic
    "data": {
        "aigc_meta_tagged": true,
        "status": "done", //任务状态
        "video_url": "https://xxxx"
    },
    "message": "Success",
    "status": 10000,  //无需关注，请忽略
    "request_id": "20250805144938F6E5264E9D24EB0C4E0A", //排查错误的关键信息
    "time_elapsed": "57.354545ms" //链路耗时
}
```

**返回报错示例：** 
```JSON
{
    "code": 50413, //状态码，优先判断 code=10000, 然后再判断data.status，否则解析有可能会panic
    "data": null, //code!=10000的情况下，该字段返回为null
    "message": "Post Text Risk Not Pass", //错误信息
    "request_id": "202511281418218670D408837A9B0EB58F", //排查错误的关键信息
    "status": 50413, //无需关注，请忽略
    "time_elapsed": "36.799829ms" //链路耗时
}
```

<span id="n5f2ufqD"></span>
## 错误码
<span id="BbsmbHe2"></span>
### **通用错误码**
请参考[通用返回字段及错误码](https://www.volcengine.com/docs/6444/69728)
<span id="dbwxYZlF"></span>
### **业务错误码**

|HttpCode |错误码 |错误消息 |描述 |是否需要重试 |
|---|---|---|---|---|
|200 |10000 |无 |请求成功 |不需要 |
|400 |50411 |Pre Img Risk Not Pass |输入图片前审核未通过 |不需要 |
|400 |50511 |Post Img Risk Not Pass |输出图片后审核未通过 |可重试 |
|400 |50412 |Text Risk Not Pass |输入文本前审核未通过 |不需要 |
|400 |50512 |Post Text Risk Not Pass |输出文本后审核未通过 |不需要 |
|400 |50413 |Post Text Risk Not Pass |输入文本含敏感词、版权词等审核不通过 |不需要 |
|400 |50516 | Post Video Risk Not Pass |输出视频后审核未通过 |可重试 |
|400 |50517 |Post Audio Risk Not Pass |输出音频后审核未通过 |可重试 |
|400 |50518 |Pre Img Risk Not Pass: Copyright |输入版权图前审核未通过 |不需要 |
|400 |50519 |Post Img Risk Not Pass: Copyright |输出版权图后审核未通过 |可重试 |
|400 |50520 |Risk Internal Error |审核服务异常 |不需要 |
|400 |50521 |Antidirt Internal Error |版权词服务异常 |不需要 |
|400 |50522 |Image Copyright Internal Error |版权图服务异常 |不需要 |
|429 |50429 |Request Has Reached API Limit, Please Try Later |QPS超限 |可重试 |
|429 |50430 |Request Has Reached API Concurrent Limit, Please Try Later |并发超限 |可重试 |
|500 |50500 |Internal Error |内部错误 |可重试 |
|500 |50501 |Internal RPC Error |内部算法错误 |可重试 |

<span id="wpZKFoEm"></span>
## 接入说明
<span id="vp5s68Px"></span>
### SDK使用说明
请参考[SDK使用说明](https://www.volcengine.com/docs/6444/1340578)
<span id="NZFToTeX"></span>
### HTTP方式接入说明
请参考[HTTP请求示例](https://www.volcengine.com/docs/6444/1390583)
&nbsp;


