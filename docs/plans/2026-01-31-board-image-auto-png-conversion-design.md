# 画布插入图片自动转 PNG 设计

## 目标
- 仅在“插入画布”时处理：拖拽、粘贴、导入本地图片。
- 非 JPG/PNG 的图片（含 HEIC/HEIF、GIF、WEBP、TIFF、AVIF 等）自动转成 PNG。
- 转换后的文件写入 board 的 `asset` 目录，`originalSrc` 指向该资产路径。
- 转换失败时不阻断插入，弹出错误提示并回退原始文件。

## 范围
- 前端插入链路：`CanvasEngine.buildImagePayloadFromFile` 的调用路径。
- 不影响聊天附件、文件系统预览、其他模块的图片处理。

## 方案
- 在 `BoardCanvasCollab` 内部通过 `engine.setImagePayloadBuilder` 统一拦截插入。
- 新增 `convertImageFileToPngIfNeeded(file)`：
  - JPG/PNG 直接返回原文件。
  - HEIC/HEIF：动态 import `heic2any`，转成 PNG `Blob` -> `File`。
  - 其他格式：使用 `FileReader` 读取 dataURL，`Image` 解码后 `canvas.toBlob('image/png')`。
- 成功转换后：
  - 先保存 PNG 到 `board/asset` 目录。
  - 再用 PNG 生成 `ImageNode` payload，`originalSrc` 设置为资产路径。
- 失败处理：
  - 弹出 `toast.error`（例如“图片转换失败，已使用原始文件插入”）。
  - 继续走原始文件插入，避免阻断用户操作。

## 数据流
1. 插入图片 -> `engine.buildImagePayloadFromFile(file)`。
2. builder 中调用 `convertImageFileToPngIfNeeded`。
3. 成功转换 -> 写入 `asset` -> 生成 payload -> `originalSrc=asset/...png`。
4. 失败 -> toast 错误 -> 直接用原文件生成 payload 并插入。

## 依赖与性能
- `heic2any` 动态加载，仅在 HEIC/HEIF 时引入。
- 转换仅发生在插入瞬间，避免影响画布渲染。

## 错误处理
- 解码失败 / 内存不足 / `toBlob` 返回空：toast 提示并回退原文件。

## 验证清单
- 拖拽 HEIC：生成 PNG 资产，`originalSrc` 指向 `asset/*.png`。
- 粘贴 AVIF/WebP：支持时转 PNG，不支持时 toast 并回退。
- 多图导入：逐张转换并保存。
- 失败场景：toast 文案可见，插入仍成功。
