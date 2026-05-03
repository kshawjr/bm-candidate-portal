-- PR 38: chapter intro partner callout text.
--
-- Optional per-chapter callout that the popup + banner render with extra
-- visual emphasis (subtle tinted card, bigger leading emoji). Born from
-- the call_prep content type's "👥 if you have a spouse, partner, or
-- co-investor" message — preserved here so the same nudge can land in any
-- chapter's intro popup, not just the (now-removed) Chapter 2 prep page.

alter table chapter_intro_popups
  add column if not exists partner_callout_text text;
