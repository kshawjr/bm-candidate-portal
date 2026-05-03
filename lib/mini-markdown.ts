/**
 * Tiny, deliberately-limited markdown renderer for admin-authored short copy
 * (chapter intro popups, eventually other admin-driven blurbs). NOT a general
 * markdown parser — supports only:
 *
 *   **bold**       → <strong>
 *   *italic*       → <em>
 *   [text](url)    → <a href="...">  (http/https/mailto only)
 *   \n\n           → paragraph break
 *   \n             → <br>
 *
 * All input is HTML-escaped before any inline conversion, so admin copy can
 * include "<", "&", etc. safely. Returns an HTML string suitable for
 * dangerouslySetInnerHTML.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

function inline(s: string): string {
  let out = s;
  // Links — done first because their text content is also a substring that
  // could otherwise match bold/italic. Limit to safe schemes.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href) => {
    if (!SAFE_URL.test(href)) return text;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  // Bold first (longer marker).
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic.
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

export function renderMiniMarkdown(input: string | null | undefined): string {
  if (!input) return "";
  const escaped = escapeHtml(input);
  const paragraphs = escaped.split(/\n{2,}/);
  return paragraphs
    .map((p) => `<p>${inline(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
