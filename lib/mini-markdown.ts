/**
 * Tiny, deliberately-limited markdown renderer for admin-authored short copy
 * (chapter intro popups, eventually other admin-driven blurbs). NOT a general
 * markdown parser — supports:
 *
 *   **bold**       → <strong>
 *   *italic*       → <em>
 *   [text](url)    → <a href="...">  (http/https/mailto only)
 *   ## heading     → <h4>           (block-level — must be the first line of
 *                                    its paragraph)
 *   - bullet       → <ul><li>       (every line in the paragraph must start
 *                                    with "- " to form a list)
 *   \n\n           → paragraph break
 *   \n             → <br>           (inside a normal paragraph)
 *
 * All input is HTML-escaped before any inline conversion, so admin copy can
 * include "<", "&", etc. safely. Returns an HTML string suitable for
 * dangerouslySetInnerHTML.
 *
 * Why a custom subset instead of a real parser: 4 existing call sites all
 * use dangerouslySetInnerHTML on the string output; swapping to react-markdown
 * would require turning every consumer into a React component. The subset is
 * brittle (no nested formatting, no ordered lists, no inline code) but
 * sufficient for the heading + bullet pattern admins are actually authoring.
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
    .map((p) => renderParagraph(p))
    .join("");
}

function renderParagraph(p: string): string {
  const trimmed = p.trim();
  if (!trimmed) return "";

  // Heading: "## Foo" → <h4>Foo</h4>. Only triggers when ## is on the
  // first line (and there's no other content on that line beyond the
  // heading text). Uses h4 because the consumer surfaces — chapter
  // intro banner / popup, step transition popup — already have h2/h3
  // for their primary heading; this is sub-heading territory.
  const headingMatch = trimmed.match(/^##\s+(.+?)\s*$/);
  if (headingMatch && !trimmed.includes("\n")) {
    return `<h4>${inline(headingMatch[1])}</h4>`;
  }

  // Bullet list: every line in the paragraph starts with "- ". One
  // stray non-bullet line falls back to regular paragraph rendering
  // rather than producing a half-rendered list.
  const lines = trimmed.split("\n");
  if (lines.length > 0 && lines.every((l) => /^-\s+/.test(l))) {
    const items = lines
      .map((l) => l.replace(/^-\s+/, ""))
      .map((item) => `<li>${inline(item)}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  return `<p>${inline(p).replace(/\n/g, "<br>")}</p>`;
}
