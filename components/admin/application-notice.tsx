// Rendered on /admin/content when an `application` step is selected.
// The 22-question light application is hardcoded in the candidate-side
// renderer because the question wording, ordering, branching, and Zoho
// field map all need to ship together as a versioned unit — admin
// editing per-brand would let those drift out of sync with the field
// map. Surfacing this constraint in the editor (instead of silently
// rendering nothing or the wrong editor) keeps the admin from looking
// for controls that intentionally don't exist.

export function ApplicationNotice() {
  return (
    <div className="adm-notice">
      <div className="adm-notice-eyebrow">Not user-editable</div>
      <p>
        This step renders the candidate application — 22 questions
        across 6 themed chapters (basics, world, money, vision, story,
        sign). The application structure, copy, and Zoho field mappings
        are configured in code, not per-brand from this admin.
      </p>
      <p>
        To change copy or question wording, edit{" "}
        <code>components/content-types/application-renderer.tsx</code>{" "}
        and the field helpers under <code>components/application/</code>.
        Content cards aren&apos;t supported on application steps —
        questions take the whole screen.
      </p>
    </div>
  );
}
