"use client";

// Rich-text caption editor for slides. TipTap-based; only exposes the
// formatting the candidate-facing renderer accepts (bold, italic, link)
// plus a size variant. Everything beyond that gets stripped server-side
// in sanitizeCaptionHtml — this UI just keeps the admin from typing
// content that would silently vanish on save.

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useState } from "react";
import { type CaptionSize } from "@/components/content-types/slide-types";
// Aliased on import to avoid colliding with the legacy wrapper-level
// `CaptionSize` type imported above. The legacy type still types the
// `size` prop (which carries pre-existing wrapper sizing through saves
// for backward compat). The mark below is what new selections use.
import {
  CaptionSize as CaptionSizeMark,
  type CaptionSizeValue,
} from "@/lib/tiptap-size-extension";

interface Props {
  /** Current caption HTML (or plain text — backwards compatible). */
  value: string | null;
  size: CaptionSize | null;
  onChange: (html: string | null, size: CaptionSize | null) => void;
}

export function CaptionEditor({ value, size, onChange }: Props) {
  // The editor only initializes once — TipTap's setContent on `value`
  // changes between drawer mounts is what keeps it in sync per slide.
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable everything except bold, italic, and the document/text
        // primitives. Headings, lists, blockquotes, etc. would all be
        // stripped server-side anyway, so don't surface them. `link` is
        // disabled here so the separately-imported Link extension below
        // owns the schema — StarterKit v3 ships Link bundled.
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        code: false,
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        validate: (href) =>
          /^(https?:|mailto:|tel:|\/|#)/i.test(href ?? ""),
      }),
      TextAlign.configure({
        types: ["paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
      CaptionSizeMark,
    ],
    content: value ?? "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // TipTap returns "<p></p>" for an empty doc — collapse that to
      // null so we don't store empty wrappers.
      const stripped = html.replace(/<[^>]+>/g, "").trim();
      onChange(stripped ? html : null, size);
    },
    editorProps: {
      attributes: {
        class: "adm-caption-editor-content",
        "data-placeholder": "Optional caption shown below the slide",
      },
    },
  });

  // Re-sync editor content when the parent swaps in a different slide
  // (e.g., admin closes the drawer and opens it on another slide).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value ?? "";
    if (current === incoming) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, value]);

  const [linkDraft, setLinkDraft] = useState<string>("");
  const [showLinkInput, setShowLinkInput] = useState(false);

  if (!editor) {
    return null;
  }

  const toggleLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!showLinkInput) {
      setShowLinkInput(true);
      const existing = editor.getAttributes("link").href as string | undefined;
      setLinkDraft(existing ?? "");
      return;
    }
    const href = linkDraft.trim();
    if (!href) {
      setShowLinkInput(false);
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href })
      .run();
    setShowLinkInput(false);
    setLinkDraft("");
  };

  return (
    <div className="adm-caption-editor">
      <div className="adm-caption-toolbar" role="toolbar" aria-label="Caption formatting">
        <button
          type="button"
          className={`adm-caption-tool${editor.isActive("bold") ? " is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={`adm-caption-tool${editor.isActive("italic") ? " is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={`adm-caption-tool${editor.isActive("link") ? " is-active" : ""}`}
          onClick={toggleLink}
          aria-label={editor.isActive("link") ? "Remove link" : "Add link"}
          title={editor.isActive("link") ? "Remove link" : "Add link"}
        >
          🔗
        </button>
        <span className="adm-caption-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={`adm-caption-tool${editor.isActive({ textAlign: "left" }) ? " is-active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          aria-label="Align left"
          title="Align left"
        >
          <AlignIcon variant="left" />
        </button>
        <button
          type="button"
          className={`adm-caption-tool${editor.isActive({ textAlign: "center" }) ? " is-active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          aria-label="Align center"
          title="Align center"
        >
          <AlignIcon variant="center" />
        </button>
        <button
          type="button"
          className={`adm-caption-tool${editor.isActive({ textAlign: "right" }) ? " is-active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          aria-label="Align right"
          title="Align right"
        >
          <AlignIcon variant="right" />
        </button>
        <button
          type="button"
          className={`adm-caption-tool${editor.isActive({ textAlign: "justify" }) ? " is-active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          aria-label="Justify"
          title="Justify"
        >
          <AlignIcon variant="justify" />
        </button>
        <div className="adm-caption-toolbar-spacer" />
        <select
          className="adm-caption-size"
          // Dropdown now reflects the size mark at the current cursor /
          // selection, not the wrapper-level size of the whole caption.
          // "Regular" maps to no mark (default body size); "sm" / "lg"
          // apply the captionSize mark inline on the selection.
          value={
            (editor.getAttributes("captionSize").size as
              | CaptionSizeValue
              | null
              | undefined) ?? ""
          }
          onChange={(e) => {
            const next = e.target.value;
            if (next === "") {
              editor.chain().focus().unsetCaptionSize().run();
            } else if (next === "sm" || next === "lg") {
              editor.chain().focus().setCaptionSize(next).run();
            }
          }}
          aria-label="Caption size"
          title="Caption size"
        >
          <option value="">Regular</option>
          <option value="sm">Small</option>
          <option value="lg">Large</option>
        </select>
      </div>
      {showLinkInput && (
        <div className="adm-caption-link-row">
          <input
            type="url"
            className="adm-input"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            placeholder="https://..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                toggleLink();
              } else if (e.key === "Escape") {
                setShowLinkInput(false);
                setLinkDraft("");
              }
            }}
          />
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={toggleLink}
          >
            Apply
          </button>
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={() => {
              setShowLinkInput(false);
              setLinkDraft("");
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

// Inline alignment icons — no icon library in this repo (see PR #81),
// so the four variants share one SVG frame and toggle line lengths to
// suggest left / center / right / justify.
function AlignIcon({
  variant,
}: {
  variant: "left" | "center" | "right" | "justify";
}) {
  const lines: Array<{ x1: number; x2: number }> = (() => {
    switch (variant) {
      case "left":
        return [
          { x1: 3, x2: 17 },
          { x1: 3, x2: 21 },
          { x1: 3, x2: 14 },
          { x1: 3, x2: 19 },
        ];
      case "center":
        return [
          { x1: 5, x2: 19 },
          { x1: 3, x2: 21 },
          { x1: 7, x2: 17 },
          { x1: 4, x2: 20 },
        ];
      case "right":
        return [
          { x1: 7, x2: 21 },
          { x1: 3, x2: 21 },
          { x1: 10, x2: 21 },
          { x1: 5, x2: 21 },
        ];
      case "justify":
      default:
        return [
          { x1: 3, x2: 21 },
          { x1: 3, x2: 21 },
          { x1: 3, x2: 21 },
          { x1: 3, x2: 21 },
        ];
    }
  })();
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} x2={l.x2} y1={6 + i * 4} y2={6 + i * 4} />
      ))}
    </svg>
  );
}
