修复了 `ThemeToggler` 组件的状态同步问题。

**问题原因：**
`ThemeToggler` 组件在初始化时使用了 `useTheme` 提供的 `theme` 和 `resolvedTheme` 属性，但在这些属性发生变化（例如页面加载完成、系统主题切换）时，并没有更新组件内部的 `current` 状态，导致按钮显示的图标与实际主题不一致。

**修复内容：**
在 `apps/web/src/components/animate-ui/primitives/effects/theme-toggler.tsx` 中：
1.  引入了 `useRef` 来追踪主题切换动画是否正在进行 (`isTransitioning`)。
2.  添加了 `useEffect` 钩子，当 `theme` 或 `resolvedTheme` 属性变化且当前没有进行切换动画时，自动更新组件内部状态。
3.  确保在动画开始和结束（包括异常中断）时正确更新 `isTransitioning` 状态，防止状态死锁或闪烁。

现在主题按钮应该能正确反映当前主题，并跟随系统或外部设置自动更新。