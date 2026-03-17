---
name: Email Operations
description: 邮件撰写、回复、摘要、分类操作指南
---

# 邮件操作指南

## 可用工具
- `email-list`: 查询邮件列表
- `email-read`: 读取邮件内容
- `email-send`: 发送邮件
- `email-reply`: 回复邮件
- `email-draft`: 保存草稿

## 操作规范
- 发送邮件前必须让用户确认收件人和内容
- 自动摘要长邮件时保留关键信息
- 回复邮件引用原文关键段落
- 敏感信息（密码、凭证）不得出现在邮件正文

## 常见场景
- 用户要求"写一封邮件" → 确认收件人、主题后 email-draft，用户确认后 email-send
- 用户要求"总结收件箱" → email-list + email-read 逐一摘要
- 用户要求"回复这封邮件" → 基于上下文生成回复 email-reply
