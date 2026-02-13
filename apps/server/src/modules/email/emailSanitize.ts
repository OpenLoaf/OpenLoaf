import sanitizeHtml, { type IOptions } from 'sanitize-html'

/** Shared sanitize options for HTML email content. */
export const SANITIZE_OPTIONS: IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
  },
  allowedSchemes: ['http', 'https', 'cid'],
  allowProtocolRelative: false,
}

/** Sanitize HTML email content. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}
