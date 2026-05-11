import { Mark, mergeAttributes } from "@tiptap/core";

// Inline size mark for slide caption text. "Regular" is the absence of
// the mark; only "sm" (smaller than body) and "lg" (editorial size)
// add a span wrapper. Coexists with bold/italic/link/text-align —
// admin highlights a selection, picks a size, and only that selection
// gets the new rendering.
export type CaptionSizeValue = "sm" | "lg";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    captionSize: {
      setCaptionSize: (size: CaptionSizeValue) => ReturnType;
      unsetCaptionSize: () => ReturnType;
    };
  }
}

export const CaptionSize = Mark.create({
  name: "captionSize",

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      size: {
        default: null as CaptionSizeValue | null,
        parseHTML: (el: HTMLElement): CaptionSizeValue | null => {
          const raw = el.getAttribute("data-caption-size");
          return raw === "sm" || raw === "lg" ? raw : null;
        },
        renderHTML: (attrs: { size: CaptionSizeValue | null }) =>
          attrs.size
            ? {
                "data-caption-size": attrs.size,
                class: `caption-size-${attrs.size}`,
              }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-caption-size]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setCaptionSize:
        (size: CaptionSizeValue) =>
        ({ commands }) =>
          commands.setMark(this.name, { size }),
      unsetCaptionSize:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
