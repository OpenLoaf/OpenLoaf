"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SelectModeProps {
  className?: string;
}

export default function SelectMode({ className }: SelectModeProps) {
  const [open, setOpen] = useState(false);
  const [isAuto, setIsAuto] = useState(true);
  const models = [
    { id: "openai", label: "OpenAi", icon: "/favicon/openai.svg" },
    { id: "gemini", label: "Gemini", icon: "/favicon/gemini.svg" },
    { id: "deepseek", label: "Deepseek", icon: "/favicon/deepseek.svg" },
    { id: "grok", label: "Grok", icon: "/favicon/grok.svg" },
  ];
  const [selectedModel, setSelectedModel] = useState(models[0].label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          className={cn(
            "h-7 w-auto inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors",
            className
          )}
        >
          <span className="max-w-[10rem] truncate whitespace-nowrap">
            {isAuto ? "Auto" : selectedModel}
          </span>
          {open ? (
            <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="auto-switch" className="text-sm">
                Auto
              </Label>
            </div>
            <Switch
              id="auto-switch"
              checked={isAuto}
              onCheckedChange={setIsAuto}
            />
          </div>

          <div className="-mx-4 h-px bg-border" />

          <div className="space-y-2">
            {isAuto && (
              <p className="text-[11px] leading-5 text-muted-foreground px-1.5">
                基于效果与速度帮助您选择最优模型
              </p>
            )}

            {!isAuto && (
              <div className="space-y-1.5">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setSelectedModel(model.label)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm hover:bg-muted/80 transition-colors",
                      selectedModel === model.label && "bg-muted/70"
                    )}
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <Image
                      src={model.icon}
                      alt={`${model.label} icon`}
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    {model.label}
                  </span>
                  {selectedModel === model.label ? (
                    <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                </button>
              ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
