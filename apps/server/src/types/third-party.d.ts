/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
declare module "*.md" {
  const content: string;
  export default content;
}

declare module "mailparser" {
  export type ParsedMailAttachment = {
    filename?: string;
    contentType?: string;
    content?: Buffer;
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
