import DOMPurify from 'dompurify';

const HTML_OPTIONS = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['class', 'style', 'target', 'rel'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['srcdoc'],
};

export function sanitizeRichHtml(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  return DOMPurify.sanitize(value, HTML_OPTIONS);
}
