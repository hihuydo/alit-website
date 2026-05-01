# Codex Spec Review — 2026-05-01
## Scope
Spec: tasks/spec.md (Sprint M1 — Mitgliedschaft + Newsletter Public-Page Texte editierbar)
Sprint Contract: 11 Done-Kriterien
Basis: Sonnet 6 spec-eval rounds (R0-R6), spec converged

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
- [Contract] `newsletter.intro` ist im Ist-Code nicht allein über den geplanten Layout-Dict-Overlay abdeckbar. Auf der echten Surface wird der Intro-Text bereits in [`src/lib/queries.ts`](src/lib/queries.ts) innerhalb `getProjekte()` zu `newsletterSignupIntro` aufgelöst und in [`src/components/ProjekteList.tsx`](src/components/ProjekteList.tsx) via `JournalBlockRenderer` gerendert; der spätere `dict`-Merge in [`src/app/[locale]/layout.tsx`](src/app/[locale]/layout.tsx) erreicht diesen Wert nicht mehr. Risiko: DK-3/DK-5 versprechen editierbares Newsletter-`intro`, shipped Ergebnis ändert nur Heading/Formtexte, aber nicht den sichtbaren Intro-Block auf `discours-agites`. Suggested fix: `getProjekte()` explizit auf `getSubmissionFormTexts(locale).newsletter.intro` umstellen oder `newsletter.intro` aus M1 streichen und klar beim bestehenden `newsletter_signup_intro_i18n` bleiben.

### [Correctness] — Edge cases, race conditions, real bugs
- [Correctness] Das gewählte Single-Key-Whole-Document-Save erzeugt ein echtes Lost-Update-Risiko bei zwei Admins. `SELECT ... FOR UPDATE` serialisiert Saves, verhindert aber kein Stale-Overwrite: Admin A ändert `mitgliedschaft.de`, Admin B speichert kurz danach aus altem Snapshot `newsletter.fr`, und B schreibt A unbemerkt zurück auf den alten Stand. Das ist hier besonders relevant, weil ein Save immer beide Forms × beide Locales persistiert. Fix: optimistic concurrency (`updated_at`/version/etag im GET + compare on PUT, bei mismatch 409) oder Save-Scope kleiner schneiden (pro Form eigener Key/Route).

### [Security] — Auth, data integrity
- [Security] none

### [Architecture] — Architektur-Smells with concrete risk (NOT nice-to-have)
- [Architecture] M1 führt für Newsletter-Texte zwei konkurrierende Content-Modelle weiter: globales `site_settings.submission_form_texts_i18n` laut Spec und bestehendes projektbezogenes `projekte.newsletter_signup_intro_i18n` im Query-Layer. Warum es zählt: selbst wenn der Contract-Bug oben gefixt wird, bleibt unklar, welche Quelle für den `discours-agites`-Intro-Text fachlich führend ist; das erzeugt spätere Drift, unklare Editor-Verantwortung und Hotfix-Risiko. Fix: eine Quelle zum Owner erklären. Entweder M1 übernimmt den Intro-Text komplett in die neue Site-Setting-Story, oder `intro` bleibt projektbezogen und M1 beschränkt sich auf Heading/Consent/Success/Error/Privacy.
- [Architecture] Die geplante Einhängung in [`src/app/[locale]/layout.tsx`](src/app/[locale]/layout.tsx) vergrößert die Blast Radius unnötig: ein Feature für zwei Formular-Surfaces hängt sich in den globalen Locale-Layout-Loader und fügt jedem Request einen weiteren `site_settings`-Read hinzu. Das passt schwächer als `journalInfo`/`leiste`, die wirklich panel-global sind. Warum es zählt: ein Defekt oder Performance-Problem im neuen Helper trifft dann alle Seiten, nicht nur Mitgliedschaft/Discours. Fix: Loader näher an die echten Consumer ziehen (`Mitgliedschaft`-Surface + `discours-agites`/Projekt-Path) oder die Query-Schicht gezielt dort anpassen, wo die Texte wirklich gebraucht werden.

### [Nice-to-have] — Out-of-scope, gehört nach memory/todo.md
- [Nice-to-have] none

## Verdict
NEEDS WORK

## Summary
4 findings — 1 Contract, 1 Correctness, 0 Security, 2 Architecture, 0 Nice-to-have.
