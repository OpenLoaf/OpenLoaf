declare module "*.md" {
  const content: string;
  export default content;
}

declare module "mailparser" {
  export type ParsedMailAttachment = {
    filename?: string;
    contentType?: string;
    size?: number;
    cid?: string;
  };

  export type ParsedMail = {
    subject?: string | null;
    from?: unknown;
    to?: unknown;
    cc?: unknown;
    bcc?: unknown;
    date?: Date | null;
    text?: string | null;
    html?: string | null;
    messageId?: string | null;
    attachments?: ParsedMailAttachment[];
  };

  export function simpleParser(
    source: string | Buffer,
    options?: Record<string, unknown>,
  ): Promise<ParsedMail>;
}

declare module "sanitize-html" {
  export interface IOptions {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowedSchemes?: string[];
    allowProtocolRelative?: boolean;
  }

  type SanitizeHtml = ((html: string, options?: IOptions) => string) & {
    defaults: { allowedTags: string[] };
  };

  const sanitizeHtml: SanitizeHtml;
  export default sanitizeHtml;
}
