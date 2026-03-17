---
name: Task Operations
description: 任务 CRUD、调度配置、审批流程操作指南
---

# 任务操作指南

## 可用工具
- `task-list`: 查询任务列表
- `task-create`: 创建任务
- `task-update`: 更新任务状态/内容
- `task-delete`: 删除任务

## 操作规范
- 创建任务时设置合理的优先级和截止时间
- 任务状态流转: todo → running → review → done
- 定时任务需配置 schedule（cron 格式）
- 需要审批的任务设置 requiresReview: true

## 常见场景
- 用户要求"创建一个任务" → 确认标题、描述后 task-create
- 用户要求"查看待办" → task-list 按优先级排序
- 用户要求"完成任务" → task-update status: done
