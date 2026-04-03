## 更新内容

### 📦 SDK 升级
- 升级 `@openloaf-saas/sdk` 从 0.1.35 到 0.1.37
- 采用 SaaSClient 新的 `locale` 参数（替代手动设置 `Accept-Language` header）
- 简化技能市场 API 调用：`detail()` 和 `download()` 不再需要显式传 `lang` 参数
