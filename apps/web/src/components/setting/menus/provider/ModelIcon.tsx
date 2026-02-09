import type { ComponentType, CSSProperties } from "react";
import {
  Anthropic,
  Claude,
  DeepSeek,
  Gemini,
  Grok,
  Kimi,
  LobeHub,
  Moonshot,
  OpenAI,
  Qwen,
  V0,
  Vercel,
  Volcengine,
} from "@lobehub/icons";

type ModelIconProps = {
  /** Icon name from model definition. */
  icon?: string | null;
  /** Icon size in pixels. */
  size?: number;
  /** Additional class name. */
  className?: string;
  /** Fallback image src when icon name is not supported. */
  fallbackSrc?: string;
  /** Fallback image alt text. */
  fallbackAlt?: string;
};

/** Map model icon names to Lobe icon components. */
const MODEL_ICON_MAP = {
  Anthropic,
  Claude,
  DeepSeek,
  Gemini,
  Grok,
  Kimi,
  LobeHub,
  Moonshot,
  OpenAI,
  Qwen,
  V0,
  Vercel,
  Volcengine,
} as const;

/** Supported icon names from @lobehub/icons. */
type ModelIconName = keyof typeof MODEL_ICON_MAP;

/**
 * Check whether icon name is supported.
 */
function isModelIconName(icon?: string | null): icon is ModelIconName {
  // 逻辑：只允许已映射的图标名称，避免渲染空组件。
  return typeof icon === "string" && icon in MODEL_ICON_MAP;
}

/**
 * Resolve icon name with fallback.
 */
function resolveModelIconName(icon?: string | null): ModelIconName {
  // 逻辑：优先使用配置 icon，缺省或不匹配时回退到 LobeHub。
  if (typeof icon === "string" && icon in MODEL_ICON_MAP) {
    return icon as ModelIconName;
  }
  return "LobeHub";
}

/**
 * Resolve icon component with color fallback.
 */
function resolveModelIconComponent(
  icon: (typeof MODEL_ICON_MAP)[ModelIconName],
): ComponentType<{ size?: number | string; className?: string; style?: CSSProperties }> {
  // 逻辑：优先使用 Color 版本，不存在时退回 Mono，避免出现图标+文字组合。
  const colorComponent = "Color" in icon ? icon.Color : undefined;
  const combineComponent = "Combine" in icon ? icon.Combine : undefined;
  return colorComponent ?? icon ?? combineComponent;
}

/**
 * Resolve icon style when using mono variants.
 */
function resolveModelIconStyle(
  icon: (typeof MODEL_ICON_MAP)[ModelIconName],
  component: ComponentType<{ size?: number | string; className?: string; style?: CSSProperties }>,
): CSSProperties | undefined {
  // 逻辑：Mono/Combine 使用主题前景色，避免黑白图标在深浅主题下不可见。
  const isColorComponent = "Color" in icon && component === icon.Color;
  if (isColorComponent) return undefined;
  return { color: "currentColor" };
}

/**
 * Render the colored model icon by name.
 */
export function ModelIcon({
  icon,
  size = 16,
  className,
  fallbackSrc,
  fallbackAlt,
}: ModelIconProps) {
  if (!isModelIconName(icon) && fallbackSrc) {
    // 逻辑：没有匹配图标时使用兜底图片，确保列表视觉一致。
    return (
      <img
        src={fallbackSrc}
        alt={fallbackAlt ?? ""}
        width={size}
        height={size}
        className={className}
      />
    );
  }
  const resolved = resolveModelIconName(icon);
  const baseIcon = MODEL_ICON_MAP[resolved];
  if (!baseIcon) return null;
  const IconComponent = resolveModelIconComponent(baseIcon);
  const iconStyle = resolveModelIconStyle(baseIcon, IconComponent);
  return (
    <IconComponent
      size={size}
      className={className}
      style={iconStyle}
      aria-hidden="true"
    />
  );
}
