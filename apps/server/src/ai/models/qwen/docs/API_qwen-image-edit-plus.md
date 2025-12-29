| https://help.aliyun.com/zh/model-studio/qwen-image-edit-guide?spm=a2c4g.11186623.help-menu-2400256.d_0_7_1.47156bcdnSOaE5&scm=20140722.H_2977275._.OR_help-T_cn~zh-V_1

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
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/thtclx/input1.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/iclsnx/input2.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/gborgw/input3.png"
                    },
                    {
                        "text": "图1中的女生穿着图2中的黑色裙子按图3的姿势坐下"
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


输入说明

输入图像（messages）

messages 是一个数组，且必须仅包含一个对象。该对象需包含 role 和 content 属性。其中role必须设置为user，content需要同时包含image（1-3张图像）和text（一条编辑指令）。

输入图片必须满足以下要求：

图片格式：JPG、JPEG、PNG、BMP、TIFF、WEBP和GIF。
输出图像为PNG格式，对于GIF动图，仅处理其第一帧。
图片分辨率：为获得最佳效果，建议图像的宽和高均在384像素至3072像素之间。分辨率过低可能导致生成效果模糊，过高则会增加处理时长。
文件大小：单张图片文件大小不得超过 10MB。
 
"messages": [
    {
        "role": "user",
        "content": [
            { "image": "图1的公网URL或Base64数据" },
            { "image": "图2的公网URL或Base64数据" },
            { "image": "图3的公网URL或Base64数据" },
            { "text": "您的编辑指令，例如：'图1中的女生穿着图2中的黑色裙子按图3的姿势坐下'" }
        ]
    }
]