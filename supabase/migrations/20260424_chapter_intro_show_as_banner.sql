-- PR 32: persistent chapter intro banner.
--
-- show_as_banner controls whether a chapter's intro popup ALSO renders as an
-- inline banner at the top of the chapter content area. The popup is
-- one-time-per-candidate; the banner is always visible while the candidate
-- is in that chapter. Defaults true so existing chapter intros surface as
-- banners by default. Admin can flip off per chapter.

alter table chapter_intro_popups
  add column if not exists show_as_banner boolean not null default true;
