/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Resolve a semantic color class for context-menu icons. */
function resolveContextMenuIconClass(
  _icon?: LucideIcon,
  _variant?: "default" | "destructive",
  iconClassName?: string
) {
  if (iconClassName) return iconClassName
  // 逻辑：默认跟随菜单项文字颜色，避免同一菜单内出现多套语义色。
  return "text-current"
}

/**
 * 修复 Radix ContextMenu 右键重新定位问题。
 *
 * 当菜单已打开时在 trigger 上再次右键，浏览器按以下顺序分发事件：
 *   1. pointerdown (button=2) → Radix DismissableLayer 调用 setOpen(false)
 *   2. contextmenu → Radix handleOpen 调用 setOpen(true)
 *
 * React 18+ 自动批处理将两次 setOpen 合并，最终状态仍为 true，
 * 跳过重渲染，floating-ui 不重新计算位置，菜单停留在旧坐标。
 *
 * 修复策略：检测到 contextmenu 紧随 close（pointerdown 导致）时，
 * preventDefault 阻止 Radix handler，用 setTimeout(0) 等 React 提交
 * close 后再分发新的 contextmenu，此时 setOpen(true) 是真正的状态变更。
 */

type ContextMenuReopenCtx = {
  openRef: React.RefObject<boolean>
  closedAtRef: React.RefObject<number>
}

const ContextMenuReopenContext = React.createContext<ContextMenuReopenCtx | null>(null)

function ContextMenu({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  const openRef = React.useRef(false)
  const closedAtRef = React.useRef(0)
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && openRef.current) {
        closedAtRef.current = performance.now()
      }
      openRef.current = next
      onOpenChange?.(next)
    },
    [onOpenChange],
  )
  const ctxValue = React.useMemo<ContextMenuReopenCtx>(
    () => ({ openRef, closedAtRef }),
    [],
  )
  return (
    <ContextMenuReopenContext.Provider value={ctxValue}>
      <ContextMenuPrimitive.Root
        data-slot="context-menu"
        onOpenChange={handleOpenChange}
        {...props}
      />
    </ContextMenuReopenContext.Provider>
  )
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  const ctx = React.useContext(ContextMenuReopenContext)
  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      // 检测：contextmenu 紧随 pointerdown 导致的 close（< 100ms）
      // 此时 Radix handler 会更新 pointRef，但 setOpen(false) + setOpen(true)
      // 被 React 批处理为 no-op，popper 不重新定位。
      // 解决：让 Radix handler 正常跑（更新 pointRef），然后直接修改 popper DOM 位置。
      const justClosed =
        performance.now() - (ctx?.closedAtRef.current ?? 0) < 100
      if (justClosed) {
        const { clientX, clientY } = event
        // 等待 Radix handler 运行完 + React 完成 DOM commit
        requestAnimationFrame(() => {
          const wrapper = document.querySelector(
            "[data-radix-popper-content-wrapper]",
          ) as HTMLElement | null
          if (wrapper) {
            const rect = wrapper.getBoundingClientRect()
            const vw = window.innerWidth
            const vh = window.innerHeight
            const pad = 8
            // 碰撞检测：确保菜单不超出视口
            let x = clientX
            let y = clientY
            if (x + rect.width > vw - pad) x = vw - rect.width - pad
            if (y + rect.height > vh - pad) y = vh - rect.height - pad
            if (x < pad) x = pad
            if (y < pad) y = pad
            wrapper.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
          }
        })
      }
      props.onContextMenu?.(event)
    },
    [ctx, props.onContextMenu],
  )
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      {...props}
      onContextMenu={handleContextMenu}
    />
  )
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  )
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  )
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg:not([class*='text-'])]:text-current flex cursor-default items-center gap-2 rounded-3xl px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      data-slot="context-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-3xl border p-1 shadow-none",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-3xl border p-1 shadow-none",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  icon: Icon,
  iconClassName,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
  icon?: LucideIcon
  iconClassName?: string
}) {
  const resolvedIconClassName = resolveContextMenuIconClass(
    Icon,
    variant,
    iconClassName
  )
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-current relative flex cursor-default items-center gap-2 rounded-3xl px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {Icon ? <Icon className={cn("h-4 w-4", resolvedIconClassName)} /> : null}
      {children}
    </ContextMenuPrimitive.Item>
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-3xl py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-3xl py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        "text-foreground px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}
