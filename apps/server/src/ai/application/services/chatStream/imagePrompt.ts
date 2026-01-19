import type { DataContent, UIMessage } from "ai";

export type GenerateImagePromptObject = {
  /** Input images for generation or edit. */
  images: Array<DataContent>;
  /** Optional prompt text. */
  text?: string;
  /** Optional mask input. */
  mask?: DataContent;
};

export type GenerateImagePrompt = string | GenerateImagePromptObject;

export type PromptImageInput = {
  /** Raw image data or url. */
  data: DataContent;
  /** Optional media type hint. */
  mediaType?: string;
};

export type ResolvedImagePrompt = {
  /** Prompt payload for AI SDK. */
  prompt: GenerateImagePrompt;
  /** Whether the prompt includes a mask. */
  hasMask: boolean;
  /** Image inputs for upload conversion. */
  images: PromptImageInput[];
  /** Mask input for upload conversion. */
  mask?: PromptImageInput;
};

/** 解析图片生成提示词。 */
export function resolveImagePrompt(messages: UIMessage[]): ResolvedImagePrompt | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "user") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const images: PromptImageInput[] = [];
    let mask: PromptImageInput | undefined;
    let text = "";
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && typeof part.text === "string") {
        text += part.text;
        continue;
      }
      if (part.type === "file" && typeof part.url === "string" && part.url.trim()) {
        const payload = { data: part.url, mediaType: part.mediaType as string | undefined };
        if (part.purpose === "mask") {
          if (!mask) mask = payload;
        } else {
          images.push(payload);
        }
      }
    }

    const trimmedText = text.trim();
    if (images.length > 0 || mask) {
      return {
        prompt: {
          images: images.map((item) => item.data),
          ...(trimmedText ? { text: trimmedText } : {}),
          ...(mask ? { mask: mask.data } : {}),
        },
        hasMask: Boolean(mask),
        images,
        mask,
      };
    }

    if (trimmedText) {
      return {
        prompt: trimmedText,
        hasMask: false,
        images: [],
      };
    }
  }
  return null;
}
