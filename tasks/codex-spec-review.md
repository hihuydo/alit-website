# Codex Spec Review — 2026-04-20
## Scope
Spec: Newsletter-Signup auf Discours-Agités-Projekt-Seite konsolidieren (15 DKs)

## Findings
### [Contract]
1. Dashboard round-trip contract is incomplete. The spec updates `POST /api/dashboard/projekte/` and `PUT /api/dashboard/projekte/[id]/`, but not the existing `GET /api/dashboard/projekte/` response shape, which is what `ProjekteSection.reload()` and the initial dashboard load consume today (`src/app/dashboard/components/ProjekteSection.tsx`, `src/app/dashboard/(authed)/page.tsx`). If GET does not return `show_newsletter_signup` and `newsletter_signup_intro_i18n`, the editor cannot faithfully reload persisted state after save.

2. Locale-level partial semantics for `newsletter_signup_intro_i18n` are undefined. The spec is careful about top-level partial PUT, but not about nested partial updates inside the JSONB object. `{"de": ...}` could mean “preserve fr”, “clear fr”, or “store sparse JSON”. That ambiguity is exactly the class of bug the current API patterns try to avoid. The spec should require one of:
   - full-object writes only, or
   - explicit per-locale sent-flags / preserve-clear semantics.

### [Correctness]
1. The slug migration is under-scoped for this repo’s shared-DB deployment model. `ensureSchema()` runs on staging too, and staging mutates the same production DB (`CLAUDE.md`, `memory/project.md`). That means the one-time `slug_de` rewrite can land before production code does. On the current app, old deep links `/projekte/discours-agits` would start 404ing immediately because route resolution is DB-driven (`src/app/[locale]/projekte/[slug]/page.tsx`, `src/lib/queries.ts`). In this setup, the old-slug redirect is not a harmless follow-up; it is part of the rollback/compat contract.

2. The spec overstates “risk-free” for the slug fix by only checking hashtag references. Hashtags are not the only coupling. `slug_de` is a live route key, canonical URL source, sitemap source, and user-visible link target (`src/lib/queries.ts`, `src/app/sitemap.ts`, `src/app/[locale]/projekte/[slug]/page.tsx`). Backlinks, bookmarks, cached crawls, and open tabs are all part of the blast radius. That needs to be reflected in scope and rollout notes.

### [Security]
1. Auditability is treated as optional, but this change modifies a public lead-capture surface from the admin dashboard. The project already treats SEO-visible mutations as audit-worthy (`slug_fr_change`, `agenda_instagram_export` in `src/lib/audit.ts`). Here, enabling/disabling signup and changing the public intro text would have no trace. Given shared staging/prod DB and admin-side mutability, I would promote an audit event for this toggle/content change from Nice-to-Have to Must-Have.

### [Architecture]
1. The spec claims the feature becomes generically reusable per project “without code change”, but the design is still single-project-hardcoded. `/[locale]/newsletter` always redirects to `discours-agites`, while rendering uses a fixed `id="newsletter-signup"` inside whichever project is expanded. If an admin later enables the flag on multiple projects:
   - `/newsletter` still targets only one project,
   - multiple expanded projects can produce duplicate `id="newsletter-signup"` anchors,
   - the “generic per-project” promise is false in navigation/routing terms.
   The spec should either explicitly scope the feature to one canonical project for now, or define the multi-project invariant and selector logic.

2. The extracted form removes its own heading, but the replacement render path does not add an accessibility label for the new `<section>`. Today `NewsletterContent` provides a visible `h2` (`src/components/nav-content/NewsletterContent.tsx`). The proposed project embed only guarantees intro + form. A landmark section without a heading/`aria-labelledby` is a regression for screen-reader navigation. The spec should require either a visible heading or a screen-reader-only heading tied to the section.

### [Nice-to-have]
1. The spec points implementers to `patterns/*.md`, but this repo does not have a local `patterns/` directory; the files live in `../patterns/`. That is not a product bug, but it is a real execution footgun for the sprint because one of the critical requirements depends on those references.

## Verdict
NEEDS WORK

## Summary
7 findings — Contract 2, Correctness 2, Security 1, Architecture 2, Nice-to-have 1
