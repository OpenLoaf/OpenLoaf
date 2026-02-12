# Review Checklist

本清单用于 `web-style-system` 的 Review Mode。

## Severity Levels

- `P0`: 阻断问题，直接破坏核心交互或可用性
- `P1`: 高优先问题，明显破坏风格一致性或信息层级
- `P2`: 中优先问题，体验质量下降但可继续使用
- `P3`: 低优先问题，建议优化项

## Review Dimensions

## A. Layout Structure

检查项：

- 顶部、侧边、主内容分层是否清晰
- 折叠/展开是否存在稳定状态
- 拖拽或尺寸变化是否出现跳变

典型问题：

- 分栏切换抖动
- 关键区被遮挡

## B. Tabs and Dock Consistency

检查项：

- active/inactive 是否有一致语法
- icon + label 展开逻辑是否统一
- 空间不足时是否正确退化（折叠、计数、tooltip）

典型问题：

- tabs 样式与母版语法断裂
- 状态颜色过重或对比不足

## C. Material and Visual Layering

检查项：

- 是否使用统一材质家族（圆角、透明层、边框、阴影）
- 背景层次是否可辨
- dark 模式下层次是否失真

典型问题：

- 同区混用不同圆角体系
- 高饱和色块破坏中性基底

## D. Motion and Feedback

检查项：

- 动效时长/曲线是否一致
- 过渡是否承载状态表达
- hover/focus/disabled/loading 是否完整

典型问题：

- 动效过慢或过大位移
- 缺失 focus 态

## E. Accessibility and Readability

检查项：

- 键盘可达性
- 文本可读性与对比
- 图标按钮是否有可理解语义

典型问题：

- 仅靠颜色表达状态
- icon-only 无可访问标签

## Reporting Format

输出结构：

1. Summary
2. Findings by severity (`P0` to `P3`)
3. Open questions (if any)
4. Minimal remediation batches

每条问题格式：

```text
[P1] file:line
问题：...
影响：...
修复方向：...
```

## Minimal Remediation Batching

建议将整改拆分为 1~3 批：

1. Batch 1: 修复 `P0/P1` 和阻断交互
2. Batch 2: 统一材质与状态语法
3. Batch 3: 动效、细节与可访问性优化

## Sampling Rule Reminder

评审与抽样时：

- 优先覆盖 `layout + tabs + dock` 链路
- 邮箱页与技能页不作为当前基线样本
