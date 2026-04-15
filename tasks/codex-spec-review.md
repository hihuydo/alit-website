# Codex Spec Review Runde 2 — 2026-04-15

## Runde-1-Findings Verification

1. **slug_de-Rename-Widerspruch**: `FIXED`
   Beleg: v2 macht `slug_de` explizit immutable in den Invariants ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:12)), verbietet `slug_de` im PUT ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:57)) und setzt das UI im Edit-Modal auf disabled ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:66)).

2. **Cross-Column-Kollisions-Warning-only**: `FIXED`
   Beleg: v2 definiert globale Slug-Uniqueness als Invariant ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:15)), verlangt Pre-Insert-Check über `slug_de`, `slug_fr` und Legacy-`slug` ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:53)) und denselben Check bei PUT für `slug_fr` ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:59)).

3. **metadataBase fehlt**: `FIXED`
   Beleg: neue SEO-Foundation mit `src/lib/site-url.ts` und `metadataBase: getSiteUrl()` im Root-Layout ist jetzt Must-Have ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:95), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:96)).

4. **Route bypassed locale-visibility**: `FIXED`
   Beleg: v2 zieht das als Invariant hoch ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:17)) und schreibt für `[locale]/projekte/[slug]` explizit `getProjekte(locale)` plus `notFound()` bei weggefilterten Projekten vor ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:78), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:80)).

5. **301 vs 308 Inkonsistenz**: `FIXED`
   Beleg: Summary, Route-Contract, Edge Cases und Architecture Decisions sprechen konsistent von `permanentRedirect`/308 ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:8), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:81), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:193)).

6. **Sitemap nutzt getProjekte(locale) statt locale-neutral**: `FIXED`
   Beleg: v2 führt `getProjekteForSitemap()` als locale-neutralen Raw-DB-Helper ein ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:73)) und schreibt ihn für `generateMetadata` und `sitemap.ts` vor ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:84), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:101)).

7. **Partial PUT slug_de-Semantik**: `FIXED`
   Beleg: v2 entfernt `slug_de` komplett aus dem Update-Vertrag und definiert nur noch `slug_fr`-Semantik sauber als `undefined = skip`, `null = clear`, `string = set`, via `CASE WHEN` ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:57), [tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:58)).

## Neue Findings (falls bei v2 entstanden)

### Contract

- [High] **Automated test coverage bleibt für die riskanten Contracts unzureichend.** v2 ergänzt nur drei Unit-Test-Blöcke: `validateSlug`, `site-url`, `buildProjektSlugMap` ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:109)). Die regressionskritischen Fälle bleiben weiter nur manuell oder implizit: API-Integration für Cross-Column-Collision, Route-NotFound bei locale-visibility, und sitemap absolute URLs/alternates ([tasks/todo.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/todo.md:27), [tasks/todo.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/todo.md:31)). Für diese Änderung ist das zu dünn.

- [Medium] **Phase 1 ist code-seitig isoliert, aber nicht operational vollständig isoliert spezifiziert.** Als eigener Commit ist `site-url.ts` + `metadataBase` sauber separierbar ([tasks/todo.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/todo.md:44)), aber die Spec macht das Staging-Env `SITE_URL` nur als Dependency/Notiz sichtbar ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:197)) und nicht als Done-Kriterium von Phase 1. Ohne gleichzeitiges Env-Update produziert derselbe Commit auf Staging falsche Canonicals.

### Correctness

- [High] **Öffentliche Hashtag-Links können durch die neue locale-visibility-Regel bewusst zu Broken Links werden.** Die Route soll versteckte Projekte in einer Locale per `notFound()` blocken ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:80)). Gleichzeitig baut das Public-Layout den `projektSlugMap` nur aus `getProjekte(locale)` ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:89)); bei Map-Miss wird stumpf auf den gespeicherten `projekt_slug` verlinkt ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:90)). Das ist nicht nur der Delete-Fallback aus dem Edge-Case-Text, sondern trifft auch regulär auf locale-hidden Projekte zu. Ergebnis: sichtbarer Hashtag auf `/de/` kann direkt auf eine garantierte 404 zeigen. Wenn das gewollt ist, muss die Spec das als bewusstes Verhalten deklarieren; wenn nicht, braucht sie entweder Render-Filter oder einen Validierungs-Contract für `projekt_slug` gegen sichtbare Projekte.

- [Medium] **Die Sitemap-Filter-Regel ist in v2 widersprüchlich formuliert.** `sitemap.ts` soll optional Projekte “nach Locale filtern”, das Beispiel direkt danach erzeugt aber gerade trotzdem einen FR-Eintrag auf die DE-Fallback-URL ([tasks/spec.md](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/tasks/spec.md:104)). Der Contract muss entscheiden: entweder immer zwei Locale-Einträge emitten, oder locale-spezifisch filtern. Beides gleichzeitig ist nicht testbar.

### Architecture

- [Medium] **`JournalPreview` ist kein echter Link-Consumer und braucht für den genannten Bug kein `projektSlugMap`.** Die Agenda-Preview nutzt tatsächlich die produktive `AgendaItem`-Komponente ([src/app/dashboard/components/AgendaSection.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/AgendaSection.tsx:563)) und ist damit eindeutig im Scope. `JournalPreview` rendert Hashtags aber nur als `<span>` ohne Link ([src/app/dashboard/components/JournalPreview.tsx](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/src/app/dashboard/components/JournalPreview.tsx:87)). Die v2-Scope-Erweiterung ist also für Agenda korrekt; für Journal ist sie nur relevant, wenn die Preview absichtlich auf klickbare Links umgestellt werden soll. Als Fix für “broken Preview-Link” ist dieser Teil derzeit overspecified.

- [Medium] **Der Spec-Punkt `Cache-Control: no-cache` in `app/sitemap.ts` ist technisch fragwürdig.** Die lokale Next-16-Typisierung modelliert `sitemap.ts` als `MetadataRoute.Sitemap` Array ohne Response/Headers ([node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts:562)), und der Resolver serialisiert diese Daten direkt zu String/XML ([node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.d.ts](/Users/huydo/Dropbox/HIHUYDO/01%20Projekte/00%20Vibe%20Coding/alit-website/node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.d.ts:3)). Wenn der Cache-Header wichtig ist, sollte die Spec auf eine Route-Handler-Lösung umschwenken statt ihn an `app/sitemap.ts` zu hängen.

## Verdict

**NEEDS WORK**

Die 7 Hauptblocker aus Runde 1 sind inhaltlich sauber gefixt. v2 ist deutlich kohärenter als v1.

Freigeben würde ich die Spec trotzdem noch nicht, weil drei Dinge offen bleiben:
- Die riskantesten Verhaltensweisen sind weiter nicht automatisiert getestet.
- Die Public-Hashtag-Strategie erzeugt mit der neuen locale-visibility-Regel potentiell absichtliche Broken Links.
- Phase 1 ist als separater Commit nur dann wirklich deploy-fähig, wenn das `SITE_URL`-Env-Rollout für Staging/Prod Teil derselben Phase ist.

## Summary

Die großen Widersprüche aus Runde 1 sind behoben: `slug_de` ist jetzt wirklich immutable, Cross-Column-Kollisionen sind hart statt warning-only, Routing ist locale-visibility-safe, SEO hat `metadataBase`, und Sitemap/Metadata laufen über einen locale-neutralen Helper.

Offen bleiben zwei Spezifikationsschärfungen und ein Test-Gap:
- Test-Suite um mindestens drei Integrationsfälle erweitern: Cross-Column-Collision API, locale-hidden Route = `notFound()`, sitemap absolute URLs + alternates.
- Entscheiden, was mit Hashtags auf locale-hidden Projekte passieren soll: Link ausblenden/validieren oder broken-link-Verhalten explizit akzeptieren.
- Phase 1 nur als separaten ersten Commit freigeben, wenn `SITE_URL`-Env-Setup gleichzeitig mit ausgerollt wird.
