"use client";

// Rich-text caption editor for slides. TipTap-based; only exposes the
// formatting the candidate-facing renderer accepts (bold, italic, link)
// plus a size variant. Everything beyond that gets stripped server-side
// in sanitizeCaptionHtml — this UI just keeps the admin from typing
// content that would silently vanish on save.

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect, useState } from "react";
import {
  CAPTION_SIZES,
  type CaptionSize,
} from "@/components/content-types/slides-renderer";

interface Props {
  /** Current caption HTML (or plain text — backwards compatible). */
  value: string | null;
  size: CaptionSize | null;
  onChange: (html: string | null, size: CaptionSize | null) => void;
}

const SIZE_LABEL: Record<CaptionSize, string> = {
  sm: "Small",
  md: "Regular",
  lg: "Large",
};

export function CaptionEditor({ value, size, onChange }: Props) {
  // The editor only initializes once — TipTap's setContent on `value`
  // changes between drawer mounts is what keeps it in sync per slide.
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable everything except bold, italic, and the document/text
        // primitives. Headings, lists, blockquotes, etc. would all be
        // stripped server-side anyway, so don't surface them.
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        validate: (href) =>
          /^(https?:|mailto:|tel:|\/|#)/i.test(href ?? ""),
      }),
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
        <div className="adm-caption-toolbar-spacer" />
        <select
          className="adm-caption-size"
          value={size ?? "md"}
          onChange={(e) => {
            const next = e.target.value as CaptionSize;
            if (CAPTION_SIZES.includes(next)) {
              onChange(value, next === "md" ? null : next);
            }
          }}
          aria-label="Caption size"
          title="Caption size"
        >
          {CAPTION_SIZES.map((s) => (
            <option key={s} value={s}>
              {SIZE_LABEL[s]}
            </option>
          ))}
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
