---
name: memory-ops
description: >
  记忆管理——当用户说"记住"、"别忘了"、表达个人偏好/习惯（"我不爱吃..."、"我喜欢..."、"我习惯..."等），
  或要求忘记/更新某条记忆，或你需要回忆之前保存的信息时，激活此技能。
tools: [memory-save, memory-search, memory-get]
---

# Auto Memory

你拥有持久化的记忆目录 `.openloaf/memory/`，内容跨会话保留。

## 操作方式

- **memory-save**: 保存/更新/删除记忆（mode: upsert / delete）
- **memory-search**: 按关键词搜索已有记忆
- **memory-get**: 读取指定 key 的完整记忆内容
- `MEMORY.md` 索引由 memory-save 自动维护，无需手动编辑
- 按主题语义组织（如 key: food-preferences、debug-patterns），而非按时间顺序
- 写入前先用 memory-search 检查是否有可更新的现有记忆

## 应该保存什么

- 用户的个人偏好和习惯（饮食、风格、工作方式等）
- 跨多次交互确认的稳定模式和约定
- 关键架构决策、重要文件路径和项目结构
- 用户的工作流程和沟通风格偏好

## 不应该保存什么

- 会话特定的上下文（当前任务细节、进行中的工作、临时状态）
- 可能不完整或未验证的信息
- 仅从阅读单个文件得出的推测性结论

## 何时保存

- 用户明确说"记住"、"别忘了"等 → 立即保存
- 用户表达个人偏好 → 主动保存，无需用户说"记住"
- 用户要求忘记 → memory-save(mode: "delete")
- 用户纠正了记忆内容 → memory-save(mode: "upsert") 更新
