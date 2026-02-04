import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  trailing,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & { trailing?: React.ReactNode }) {
  const hasTrailing = Boolean(trailing)
  const headerClassName = cn(
    "relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-2",
    hasTrailing ? "grid-rows-[auto_auto] items-start gap-y-0.5" : "grid-rows-[auto] items-center"
  )
  const triggerRowClassName = hasTrailing ? "row-start-1 row-end-3" : "row-start-1 row-end-2"
  const contentGridClassName = cn(
    "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2",
    hasTrailing ? "grid-rows-[auto_auto] items-start gap-y-1" : "grid-rows-[auto] items-center"
  )
  const chevronClassName = cn(
    "text-muted-foreground pointer-events-none col-start-2 row-start-1 size-4 shrink-0 transition-transform duration-200",
    hasTrailing ? "translate-y-0.5" : ""
  )
  return (
    <AccordionPrimitive.Header className={headerClassName}>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 col-start-1 col-end-3 flex w-full rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          triggerRowClassName,
          className
        )}
        {...props}
      >
        <div className={contentGridClassName}>
          <div className="min-w-0">{children}</div>
          <ChevronDownIcon className={chevronClassName} />
        </div>
      </AccordionPrimitive.Trigger>
      {trailing ? (
        <div className="row-start-2 col-start-2 z-10 shrink-0">{trailing}</div>
      ) : null}
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
