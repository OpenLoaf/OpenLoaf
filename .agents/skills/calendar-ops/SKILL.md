---
name: Calendar Operations
description: 日程 CRUD、时间管理、日历查询指南
---

# 日历操作指南

## 可用工具
- `calendar-list-events`: 查询日程列表
- `calendar-create-event`: 创建新日程
- `calendar-update-event`: 修改日程
- `calendar-delete-event`: 删除日程

## 操作规范
- 创建日程时确认时区（用户本地时区）
- 时间格式使用 ISO 8601
- 重复日程需指定 rrule
- 修改/删除前先查询确认目标日程

## 常见场景
- 用户要求"查看今天日程" → calendar-list-events 当天时间范围
- 用户要求"安排会议" → 确认时间、标题后 calendar-create-event
- 用户要求"取消会议" → 先查询确认，再 calendar-delete-event
