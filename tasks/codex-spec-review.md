# Codex Spec Review: URL-Slug-Übersetzung für Projekte

## Contract

- [High] `tasks/spec.md` is internally inconsistent on redirect semantics. The Must-Have and Done-Kriterien say "301", but the technical approach explicitly chooses `permanentRedirect`, which in Next App Router yields a permanent redirect response different from a literal 301 expectation. The contract needs one canonical status target, otherwise QA is untestable as written.

- [High] The contract contradicts itself on slug collision handling. Must-Have #2 only requires per-column uniqueness (`slug_de` unique, `slug_fr` partial unique), while `tasks/todo.md` requires cross-column uniqueness checks, and the Risk section downgrades the same problem to a non-blocking warning. Those three positions cannot all be true. The spec must choose one invariant.

- [Medium] The sprint ordering is underspecified for a bootstrap-migration architecture. Because `ensureSchema()` runs in `src/instrumentation.ts`, the spec should require this order explicitly: additive columns, backfill, duplicate/empty preflight, unique indexes, `NOT NULL`, writer dual-write, then reader/routing switch. Without that, a partially-correct implementation can still take the whole app down at boot.

- [Medium] Several Done-Kriterien are not concretely testable yet. They rely on manual behavior but omit the automated cases most likely to regress: cross-column collision rejection, `slug_fr` `undefined|null|string` PUT semantics, locale-priority route resolution, migration re-run safety, sitemap absolute URLs, and dashboard preview/link propagation.

## Correctness

- [Critical] The spec says `projekt_slug` remains a stable internal ID keyed to `slug_de`, but `tasks/todo.md` Phase 3 also allows `slug_de` to be changed via PUT. That breaks the core resolver design: existing agenda/journal hashtag references continue pointing at the old `slug_de`, while the project row moves to a new one. This is not a follow-up nicety; it is a direct contradiction in the model. Either `slug_de` must be immutable after create, or this sprint must include hashtag migration/history. In the current form, the spec is not coherent.

- [Critical] The route lookup remains ambiguous under the proposed constraints. `WHERE slug_de = $1 OR slug_fr = $1 LIMIT 1` is only safe if slugs are globally unique across both columns. The spec acknowledges this in Risk 2, but the mitigation is still unresolved: Must-Have #16 says one simple query, Phase 5 says locale-priority query, and the Risk section suggests a warning-only validator. Warning-only is insufficient because it still allows two different projects to own the same path depending on locale/query ordering.

- [High] The route contract is not aligned with current locale-isolation readers. Today `getProjekte(locale)` filters DE differently from FR. The spec changes `[locale]/projekte/[slug]/page.tsx` to resolve directly from `projekte` by slug, but does not say whether the route must also enforce the same locale visibility rules as `getProjekte(locale)`. Without that, `/de/projekte/<slug>` can return 200 while the corresponding project is absent from the rendered list in panel 3, producing a valid page shell with no expanded item.

- [High] Partial PUT semantics are only fully specified for `slug_fr`, not `slug_de`. The sprint relies on nullable-safe semantics (`undefined` skip, `null` clear) but does not define the allowed states for `slug_de` on PUT with the same rigor. The spec should say explicitly whether `slug_de` can be omitted, whether empty string is rejected on PUT as well as POST, and whether updates touching only `slug_fr` must leave legacy `slug` untouched.

- [Medium] The spec underestimates empty-state and degraded-state behavior around obsolete hashtag references. "Fallback to stored value -> notFound on click" preserves status quo, but once `slug_de` becomes the declared stable ID, this becomes a more severe integrity issue than today. If rename is disallowed, that fallback is acceptable; if rename remains allowed, the fallback becomes a guaranteed broken-link generator.

## Security

- [Medium] Admin slug changes are SEO- and routing-critical mutations, but the spec does not require audit logging. The existing project memory explicitly calls out auth hardening and audit logs for dashboard actions. Slug mutations should be logged with actor, project id, old/new `slug_de`, old/new `slug_fr`, and timestamp.

- [Medium] The migration plan needs an explicit duplicate/invalid-data preflight before creating unique constraints. In this codebase, schema migration runs during server bootstrap. If production data contains one bad duplicate or empty slug, the app does not merely reject the migration; it can fail startup and take all routes down. The spec mentions idempotent backfill, but not the necessary precondition-abort path for duplicate legacy slugs.

- [Low] The spec has no feature flag or reversible reader switch. Legacy dual-write helps code rollback, but it does not reduce the blast radius of a bad reader/routing change deployed against live traffic. For a route- and SEO-facing change, a narrow kill-switch would materially reduce risk.

## Architecture

- [High] The SEO plan violates a documented project pattern by omission: it adds `generateMetadata(... alternates.languages)` and `sitemap.ts` without requiring `metadataBase` and a runtime-safe app URL helper. In this repo, root `src/app/layout.tsx` currently has neither. That makes the SEO work incomplete as specified and risks relative or wrong-host alternates/canonicals.

- [High] The spec couples slug resolution too tightly to `getProjekte(locale)`. It proposes building the hashtag map from the locale-resolved reader and even suggests `getProjekte('de')` as the sitemap source. That is the wrong abstraction boundary. Sitemap generation, route canonicalization, and hashtag resolution all need a locale-neutral slug source of truth; otherwise future content-filtering rules in `getProjekte(locale)` can silently change routing and SEO behavior.

- [Medium] The file blast radius is understated. Changing `AgendaItem` and `JournalSidebar` link resolution is not isolated to the public wrapper path. `AgendaItem` is also used in dashboard preview flows, and the dashboard hashtag tooling (`HashtagEditor`, `AgendaSection`, `JournalEditor`) currently assumes a single `slug` project option. If the project option contract changes or `projektSlugMap` becomes required, the preview/editor paths are part of the same architecture surface and should be listed in scope.

- [Medium] The spec keeps the current wrapper-centric architecture, which is good, but it should explicitly define `slug_de` as the stable internal key used for React keys, expansion refs, and hashtag dropdown values. Right now the proposed text mixes internal identifier and public URL slug concerns in a way that invites accidental use of `urlSlug` as an internal key.

- [Medium] `src/app/sitemap.ts` being database-driven and `force-dynamic` is compatible with the current architecture, but the spec should require absolute URLs and a locale-neutral query/helper. Generating sitemap entries from a UI reader that computes fallback display content is hidden coupling, not a clean SEO boundary.

## Nice-to-have

- Add an explicit invariant section to the spec:
  `slug_de` is the immutable internal identifier.
  `slug_fr` is an optional locale-specific URL alias.
  `urlSlug` is a derived render value only.

- Add a dedicated migration preflight checklist:
  check for duplicate legacy `slug`,
  check for empty legacy `slug`,
  abort with actionable error before index creation,
  skip cleanly on re-run if already migrated.

- Add automated acceptance tests to the Done-Kriterien:
  cross-column collision rejected,
  `slug_fr` clear vs skip semantics,
  `/de` route cannot resolve a project hidden by DE locale rules,
  sitemap emits absolute URLs,
  dashboard preview hashtag links still render valid hrefs.

- If slug rename is a real product requirement, split it into a follow-up sprint with hashtag rebinding and redirect history. Do not smuggle rename support into this sprint under the current resolver design.

## Verdict

**NEEDS WORK**

## Summary

The main issue is not implementation size; it is contract coherence. The spec currently tries to treat `slug_de` as both a stable internal identifier and an editable public slug, and it tries to permit cross-column ambiguity while also promising deterministic routing and canonical redirects. Those are incompatible.

If you tighten three points, the sprint becomes viable without a split:
1. Make `slug_de` immutable after create, or explicitly move rename support out of scope.
2. Require global uniqueness across `slug_de` and `slug_fr`, not warning-only handling.
3. Add the missing SEO/runtime prerequisites: `metadataBase`, absolute URL source, and a locale-neutral slug helper for routing/sitemap/hashtag resolution.
