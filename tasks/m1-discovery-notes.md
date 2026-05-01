# Sprint M1 — DK-9 Discovery Notes
# Generated: 2026-05-01 (Generator-Phase Step 1)

## Purpose

Per DK-9 (BLOCKING Implementation-Step 1): enumerate ALL read-sites of `dict.mitgliedschaft.*` and `dict.newsletter.*` so DK-5 (public-page wiring) covers them completely. Codex-review-evidence for DK-5 vollständigkeit.

## grep-Patterns ausgeführt

```bash
grep -rn "dict\.newsletter" src/ --include="*.tsx" --include="*.ts"
grep -rn "dict\.mitgliedschaft" src/ --include="*.tsx" --include="*.ts"
grep -rnE "const \{[^}]*newsletter[^}]*\}.*=.*dict|const \{[^}]*mitgliedschaft[^}]*\}.*=.*dict" src/
grep -rnE 'Dictionary\["(newsletter|mitgliedschaft)"\]' src/
grep -rnE "dict\?\.\(?(newsletter|mitgliedschaft)" src/
```

## Read-Sites — Mitgliedschaft

| File:Line | Use | M1 dict-overlay needed? |
|---|---|---|
| `src/components/Navigation.tsx:70` | `dict={dict.mitgliedschaft}` prop pass-through to `<MitgliedschaftContent>` | **YES** — MUSS merged dict.mitgliedschaft erhalten |
| `src/components/nav-content/MitgliedschaftContent.tsx:6` | `type MitgliedschaftDict = Dictionary["mitgliedschaft"]` (type-level only, no runtime read) | n/a (type) |

**Implementation:** Layout overlay `dict.mitgliedschaft = { ...baseDict.mitgliedschaft, ...mergedMitgliedschaftTexts }` propagiert via Wrapper → Navigation → MitgliedschaftContent. Kein zusätzlicher Code-Touch in den Components.

## Read-Sites — Newsletter

| File:Line | Use | M1 dict-overlay needed? |
|---|---|---|
| `src/components/ProjekteList.tsx:125` | `{dict.newsletter.heading}` direct render | **YES** — heading ist in M1 editable |
| `src/components/ProjekteList.tsx:128` | `dict={dict.newsletter}` prop to `<NewsletterSignupForm>` | **YES** — Form liest consent/successTitle/successBody/errorGeneric/errorRate/privacy aus prop |
| `src/components/NewsletterSignupForm.tsx:6` | `type NewsletterDict = Dictionary["newsletter"]` (type-level) | n/a (type) |
| `src/lib/queries.ts:385` | `wrapDictAsParagraph(dict.newsletter.intro)` — fallback für projekt's `newsletterSignupIntro` wenn DB-Feld leer | **NO** — `intro` ist out-of-scope für M1 (Codex R7 finding). `getProjekte` ruft selbst `getDictionary(locale)` auf (Zeile 355), nicht den merged dict aus layout — bleibt RAW dictionary. Fallback-Verhalten unverändert. |
| `src/content/projekte.ts:39` | Comment-only Reference auf `dict.newsletter.intro` | n/a (comment) |
| `src/lib/queries-projekte-newsletter.test.ts:41` | Test für queries.ts:385 fallback | n/a (test of unchanged behavior) |

**Implementation:** Layout overlay `dict.newsletter = { ...baseDict.newsletter, ...mergedNewsletterTexts }` propagiert via Wrapper → ProjekteList → (heading direkt + NewsletterSignupForm via prop). Kein Code-Touch in den Components.

**WICHTIGE NOTE für Generator:**
- `dict.newsletter.intro` MUSS im merged-dict den **dictionary-Wert** behalten (nicht override). `mergeWithDefaults` läuft nur über die 7 editierbaren Felder (heading, consent, successTitle, successBody, errorGeneric, errorRate, privacy) — `intro` bleibt unberührt aus baseDict.
- Damit funktioniert `queries.ts:385` weiter mit `getDictionary(locale).newsletter.intro` (== baseDict.newsletter.intro) als Fallback wenn ein Projekt kein eigenes `newsletter_signup_intro_i18n` hat.

## Read-Sites die im merged-dict-overlay ALLE auf den Edit-Pfad reagieren

- ✅ `Navigation.tsx:70` (Mitgliedschaft)
- ✅ `ProjekteList.tsx:125` (Newsletter heading)
- ✅ `ProjekteList.tsx:128` → `NewsletterSignupForm` (Newsletter form prose)

## Read-Sites die UNBERÜHRT bleiben (intentionally out-of-scope)

- `queries.ts:385` (`dict.newsletter.intro` → projekt-row fallback) — siehe Codex R7, `intro` lebt in `projekte.newsletter_signup_intro_i18n`
- Type-only references in `MitgliedschaftContent.tsx:6` und `NewsletterSignupForm.tsx:6` (typeof-imports)
- Test files (`queries-projekte-newsletter.test.ts:41`, `NewsletterSignupForm.test.tsx:25`)
- Comment in `content/projekte.ts:39`

## Conclusion

**3 runtime read-sites** (Navigation, ProjekteList × 2) werden vom layout-level dict-overlay automatisch covered. Kein Component muss touched werden für DK-5.

**1 read-site** (`queries.ts:385`) bleibt bewusst auf RAW dictionary — `intro` ist out-of-scope per Codex R7, weil dort die existierende `projekte.newsletter_signup_intro_i18n`-CRUD die source-of-truth ist.
