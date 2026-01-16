# S3 临时存储方案（用于 AI 公网访问）

## 目标

- 本地文件仍使用相对路径保存与访问。
- S3 仅作为临时公网地址来源，供 AI 模型请求使用。
- 通过同目录 `.s3` 元数据文件缓存 URL 与过期信息，避免重复上传。
- 服务端定时清理过期 S3 对象与 `.s3` 文件。

## 关键流程

### 1) 保存本地文件

- 业务继续走相对路径的保存逻辑。
- S3 上传不发生在保存阶段。

### 2) AI 请求前获取公网 URL

1. 读取本地图片路径 `imagePath`。
2. 检查同目录 `imagePath + ".s3"` 是否存在。
3. 如果 `.s3` 存在且未过期，直接取 `url`。
4. 如果 `.s3` 不存在或已过期：
   - 上传到 S3（临时前缀，如 `ai-temp/`）
   - 生成 `.s3` 文件
   - 返回新的 `url` 供 AI 使用

### 3) 定时清理

- 服务端每 1 小时扫描所有 `.s3` 元数据文件。
- 若当前时间超过 `expiresAt`：
  - 删除 S3 对象
  - 删除 `.s3` 文件

## .s3 元数据文件格式

文件名：`{imageName}.s3`

```json
{
  "version": 1,
  "providerId": "s3-provider-key",
  "bucket": "bucket-name",
  "key": "ai-temp/2025/02/abc.png",
  "url": "https://cdn.example.com/ai-temp/abc.png",
  "createdAt": "2025-02-01T12:00:00Z",
  "expiresAt": "2025-02-02T12:00:00Z",
  "contentType": "image/png",
  "etag": "xxxx"
}
```

建议字段说明：

- `version`: 元数据版本，便于未来升级。
- `providerId`: 使用的 S3 provider 配置 ID。
- `bucket`/`key`: S3 对象定位。
- `url`: 可直接用于 AI 请求的公网 URL。
- `createdAt`/`expiresAt`: 过期管理依据。
- `contentType`/`etag`: 辅助校验与追踪。

## 服务端模块建议

### A) S3 临时对象服务

位置建议：`apps/server/src/modules/storage/s3TempObjectService.ts`

职责：

- `ensureTempObject(localPath, config, ttlHours)`
  - 读取 `.s3` 元数据
  - 校验过期时间
  - 上传 S3 并写回 `.s3`
  - 返回 `url`

### B) 元数据读写

位置建议：`apps/server/src/modules/storage/s3TempMeta.ts`

职责：

- `readS3Meta(path)`
- `writeS3Meta(path, data)`
- `isExpired(meta, now)`

### C) 清理任务

位置建议：`apps/server/src/modules/storage/s3TempCleanup.ts`

职责：

- 扫描 workspace/project 下的所有 `.s3` 文件
- 删除过期 S3 对象 + 删除 `.s3` 文件
- 作为服务端定时任务（每小时执行）

## S3 多服务商适配方案

### 配置统一

使用统一的 S3 Provider 结构，覆盖主流厂商差异：

- `providerId`
- `endpoint`
- `region`
- `bucket`
- `accessKeyId`
- `secretAccessKey`
- `forcePathStyle`
- `publicBaseUrl`

### 兼容差异点

- **Endpoint**: 各厂商不同，必须可配置。
- **Region**: 有些厂商忽略，但 SDK 仍需值。
- **Path-style**: 某些厂商必须 `forcePathStyle=true`。
- **域名**: `publicBaseUrl` 支持 CDN 或自定义域。

### URL 生成规则

优先级：

1. `publicBaseUrl`
2. `endpoint`（支持 `{bucket}` 占位符）
3. `s3://bucket/key` 兜底

### 兼容策略

- 优先使用统一 SDK（AWS SDK v3）。
- 若某厂商存在不兼容，再对该 provider 定制适配策略。

## 建议的配置与默认值

- 临时对象前缀：`ai-temp/`
- 默认 TTL：24 小时
- 清理频率：每小时

## 注意事项

- `.s3` 文件是缓存，不应作为唯一真相。
- 清理时需容错：S3 对象不存在时允许忽略。
- 多进程场景需要考虑并发上传与元数据竞争。
