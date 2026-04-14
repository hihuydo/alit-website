# Scope
- Reviewed only [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md) and [tasks/todo.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/todo.md).
- No codebase / implementation review.
- Focus: migration safety, JSONB defaults, editor state, fallback semantics, sprint sizing, done-criteria verifiability.

# Findings
- [Contract] Migration contract is internally inconsistent. `spec.md` says backfill may merge DE/FR rows by `sort_order` heuristic, but `todo.md` says identical `sort_order` must abort. In row-per-locale data, identical `sort_order` across DE/FR is the normal case, not an edge case. This must be one rule, not both.
- [Correctness] For Prod as stated (`spec.md`: only DE rows), the backfill is safe if the migration explicitly asserts `count(locale='fr') = 0` before merge logic. As written, the spec still describes a generic merge path for hypothetical FR data; that path is not safe enough because `sort_order` is positional, not a stable identity.
- [Architecture] If any FR rows exist, `sort_order` matching is only safe under an extra invariant not stated here: DE and FR already have identical logical grouping and ordering. Without that invariant, wrong merges are silent data corruption. Safer contract: Sprint 1 supports only DE-only backfill; if any FR row exists, abort and require manual/import script.
- [Correctness] `JSONB NOT NULL DEFAULT '{}'` has no silent truncation risk in PostgreSQL. The real risk is semantic masking: `{}` can mean "not translated yet", "backfill skipped", or "editor intentionally empty". That weakens migration observability unless post-migration checks distinguish those cases.
- [Contract] Done criterion `content_i18n = '{}' -> 0` is too weak for proving a correct backfill. It does not prove `title_i18n` was migrated, does not prove locale keys are valid, and treats intentionally empty DE content the same as failed migration.
- [Correctness] The form model is double-stateful by design: parent `form.*_i18n` plus Rich-Text-Editor internal state. The spec acknowledges remount/undo loss, but does not guarantee last-keystroke flush on tab switch. If the editor debounces updates, unsaved input can be lost on remount.
- [Architecture] "Commit current editor content on tab switch, then remount" is only safe if the editor exposes a synchronous flush API or is fully controlled. That requirement is missing from the contract and from the done criteria. Without it, the UX guarantee is underspecified.
- [Nice-to-have] Lower-risk alternative: keep one editor instance per locale mounted and hide inactive tab, or define an explicit `flushCurrentLocale()` requirement before locale switch. More memory, less data-loss risk.
- [Correctness] Mixed-language sections with `lang="de"` on fallback wrappers are not an SEO problem by themselves. Inline/section-level `lang` is correct for accessibility and parsing. `hreflang` solves page-to-page alternates, not mixed fragments. The real SEO risk is product quality: a `/fr` page that is mostly DE fallback may be a weak FR landing page.
- [Contract] If `hreflang` is important, it is not covered here. That is acceptable only if alternate links already exist elsewhere; otherwise the spec should state "no hreflang changes in this sprint" explicitly.
- [Architecture] Scope is broadly right-sized for a foundation sprint: one entity plus end-to-end vertical slice is the correct proving ground. It becomes too big only if FR-row auto-merge support is kept in scope, because that adds migration ambiguity and operator playbooks.
- [Contract] Not all 11 done criteria are mechanically verifiable as written. `pnpm build`, `pnpm test`, DB schema, SQL counts, API shape, and HTTP 200 are mechanical. The rest are not fully specified for automation.
- [Contract] Specifically non-mechanical/underspecified: "Tab-Wechsel ... ohne Reload", badge rendering, "visueller Diff = 0", FR fallback `lang` on wrapper, "Sonnet-Gate clean", and "Codex-Review clean". These need exact scripts/selectors/baselines or they remain reviewer judgment.

# Verdict
NEEDS WORK

# Summary
- Keep Sprint 1 as "1 entity + foundation", but narrow migration scope: DE-only backfill is allowed; any existing FR row aborts.
- Remove the contradictory `sort_order` merge story unless you can define a stable logical-entity key.
- Keep `NOT NULL DEFAULT '{}'`; there is no truncation issue, but strengthen migration verification beyond `content_i18n != '{}'`.
- Tighten the editor contract: require synchronous flush or non-remounting per-locale editors to avoid unsaved-input loss.
- Rewrite done criteria so each item is scriptable or explicitly marked manual.
