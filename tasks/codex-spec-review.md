# Codex Spec Review R2 — 2026-04-19

## Scope
Spec: tasks/spec.md v2 (Codex-R1 addressed)
Sprint Contract: 12 Done-Kriterien + 4 Release-PMC items
Basis: R1 Verdict = NEEDS WORK, 12 findings; R2 verifies the fixes

## R1 Findings Verification

1. [Contract] Beide-Flow API-Contract unscharf  
   Status: RESOLVED  
   Reasoning: v2 makes the client contract explicit: `InstagramExportModal` now has per-locale state, `Beide` uses two parallel metadata fetches, preview is rendered as two grids, and ZIP structure is defined as `de/` + `fr/`.

2. [Contract] DK-9 nicht mechanisch verifizierbar  
   Status: RESOLVED  
   Reasoning: DK-9 is now split into hard invariants: all 3 font files must be read, `ImageResponse.fonts` must contain weights 300/400/800, and a mocked font-read failure must return 500 with `{error:"font_load_failed"}`. The visual font check was moved to PMC.

3. [Contract] v1-ohne-Bilder User-Visible-Verhalten fehlt  
   Status: RESOLVED  
   Reasoning: v2 adds a mandatory modal banner when `item.images.length > 0` or embedded non-text blocks exist, and the edge-case contract now treats textless media-only locales as `locale_empty`.

4. [Correctness] Hard-Cap-10 Widerspruch (Metadata vs Preview)  
   Status: RESOLVED  
   Reasoning: v2 defines clamp semantics consistently: metadata returns the clamped `slideCount <= 10` plus `warnings:["too_long"]`, preview renders only clamped tiles, and slide fetch returns 422 only for `slideIdx >= 10` when raw count exceeded the cap.

5. [Correctness] Cache-Control fehlt auf PNG-Route  
   Status: RESOLVED  
   Reasoning: the slide route now explicitly requires `Cache-Control: no-store, private`, and DK-7 checks for that header.

6. [Correctness] Single-Flight für ZIP-Download fehlt  
   Status: RESOLVED  
   Reasoning: v2 now requires a synchronous `useRef<boolean>` mutex, lock-before-async, button disabled state, `aria-busy`, and unlock in `finally`. The DK-11 contract also requires the double-click test.

7. [Correctness] Deleted-mid-session nicht zu Ende spezifiziert  
   Status: RESOLVED  
   Reasoning: v2 defines the modal behavior: on preview/download 404 or 410, refetch metadata once; on repeated failure, show “Eintrag wurde gelöscht” and disable download.

8. [Correctness] "Leeres Locale" fachlich unscharf bei nur-Bildern  
   Status: RESOLVED  
   Reasoning: v2 explicitly defines `locale_empty` against exportable text after flattening and documents the image-only locale case as empty.

9. [Correctness] "Beide" braucht getrennte Zustandsmaschinen DE+FR  
   Status: RESOLVED  
   Reasoning: v2 explicitly requires per-locale `{loading, slideCount, warnings, error}` state and documents separate DE/FR preview grids and ZIP folders.

10. [Security] `?download=1` als Client-Claim  
    Status: RESOLVED  
    Reasoning: v2 now documents this honestly as a client-declared export intent, not cryptographic proof, and explicitly forbids adding a `verified` claim to the audit details.

11. [Architecture] Audit bypasst bestehendes `auditLog()`-Pattern  
    Status: RESOLVED  
    Reasoning: v2 switched to the existing pattern: extend `AuditEvent`, extend `AuditDetails`, extend `extractAuditEntity`, and call only `auditLog()` from the route. Route-local `INSERT` is explicitly forbidden.

12. [Architecture] Font-Failure-Mode nicht entschieden  
    Status: RESOLVED  
    Reasoning: v2 is explicit: font-load failures are fail-closed, return 500, and log `[ig-export] font_load_failed ...`; no fallback PNG is allowed.

13. [Nice-to-have] DK-13/14 Deploy-Gates in Sprint-Contract  
    Status: RESOLVED  
    Reasoning: deploy checks were moved out of the sprint contract into a separate Release-PMC section, and `tasks/todo.md` now states that DK-1..DK-12 are the sprint contract.

## New Findings (if any)

1. [Correctness] `locale_empty` is internally inconsistent because Must-Have-5 uses `t(item.title_i18n, locale)` without disabling DE fallback. In this repo `t()` falls back to `"de"` by default, so an FR-empty item with a DE title can evaluate as non-empty even though the edge-case table and DK-5 clearly intend locale-local semantics. The spec should require either `t(field, locale, locale)` or direct locale access for the emptiness check.

2. [Architecture] The new audit event contract is weakly typed and internally inconsistent. v2 adds `agenda_id`, `locale`, `scale`, and `slide_count` as optional `AuditDetails` fields, but for `agenda_instagram_export` those fields are effectively required if per-entity audit history is meant to work. With the current pattern, `auditLog("agenda_instagram_export", { ip })` would still type-check. There is also an internal prose mismatch: the main audit bullet correctly says `entity_id: details.agenda_id ?? null`, but the “Files to Change” table regresses to `entity_id: details.agenda_id`. That should be normalized and, ideally, strengthened to a discriminated payload type or a route-side invariant.

3. [Correctness] The new `Beide` gate still has an async-loading race. The modal is specified as opening with an agenda-item id and learning per-locale emptiness via metadata fetches, but the spec does not require `Beide` to remain disabled until both locale metadata checks have settled. That leaves a window where `Beide` can be interactable before one locale comes back `locale_empty` or 404. The gate should be defined as disabled while either DE or FR metadata is unresolved.

## Verdict
NEEDS WORK

## Summary
13 R1-RESOLVED, 0 R1-PARTIAL, 0 R1-NOT-RESOLVED. New findings: 3 total.
