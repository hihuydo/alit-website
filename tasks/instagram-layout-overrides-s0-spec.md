# Spec: S0 — Block-ID Stabilität + AuditEvent Extension (Layout-Overrides Prerequisite)
<!-- Created: 2026-04-29 -->
<!-- Author: Planner (Opus) -->
<!-- Status: Draft v1 (split aus instagram-layout-overrides-spec-v3-reference.md per Sonnet R3 SPLIT recommendation) -->
<!-- Branch: feat/journal-block-id-stability -->
<!-- Depends on: nichts (kann direkt nach PR #129 merge starten) -->
<!-- Enables: S1 (Layout-Overrides Backend) → S2 (Layout-Overrides Modal UI) -->

## Summary

Stabilisiere Journal-Block-IDs über den vollständigen Editor-Round-Trip + erweitere `AuditEvent` Union um die zukünftigen Layout-Override-Events. Pure-prerequisite-Sprint — kein User-facing-Feature, aber unverzichtbare Foundation für S1/S2.

**Was NICHT in Scope ist:**
- Kein DB-Schema-Change (kommt in S1)
- Kein API-Endpoint (kommt in S1)
- Keine UI-Änderung (kommt in S2)
- Kein Eager-Backfill bestehender Einträge — Bestand bleibt bis next-edit unverändert
- Kein UUID-Format-Change für Block-IDs — bleibt `b<ts>-<n>`

---

## Sprint Contract (Done-Kriterien)

1. **`pnpm build` grün, `pnpm exec tsc --noEmit` clean.**
2. **`pnpm test` grün** — Baseline 806 → ~820+ (~14 neue Tests).
3. **`pnpm audit --prod` 0 HIGH/CRITICAL.**
4. **3-Layer Block-ID Round-Trip funktioniert** — Block-IDs überleben:
   - **Layer 1** — `journal-html-converter.ts`: `blocksToHtml(block)` emittiert `data-bid="<id>"` auf jedem text-block-tag (`p`, `h2`, `h3`, `blockquote`). `htmlToBlocks(html)` liest `data-bid` per Element, fällt nur auf `id()` zurück wenn Attribut fehlt oder nicht zum Format `/^b[0-9a-z]+-[0-9a-z]+$/` passt.
   - **Layer 2** — `RichTextEditor.tsx::sanitizeHtml`: per-tag attribute allowlists werden um `data-bid` erweitert für `p`/`h2`/`h3`/`blockquote`/`figure`. Single-Line addition: `if (["p","h2","h3","blockquote","figure"].includes(tag) && attr.name === "data-bid") continue;`
   - **Layer 3** — `journal-validation.ts::validateBlock`: bleibt unverändert (akzeptiert beliebige `block.id` strings — `b<ts>-<n>` Format passt). Spec-Doc-Note: "future hardening to UUID-format would break overrides".
5. **3-Layer Round-Trip Test** in `journal-html-converter.test.ts`: vollständige Pipeline `blocksToHtml(blocks) → sanitizeHtml(innerHTML) → htmlToBlocks(sanitized)` über N=5 Zyklen — IDs preserviert.
6. **`AuditEvent` Union erweitert** in `src/lib/audit.ts`: `"agenda_layout_update" | "agenda_layout_reset"` als Members hinzugefügt.
7. **`audit-entity.ts::extractAuditEntity` mapping** für beide neuen Events: `{entity_type: "agenda_items", entity_id: details.agenda_id ?? null}`.
8. **`AuditDetails` Type erweitert** falls nötig — sollte `slide_count`, `image_count`, `locale` bereits enthalten (verifizieren). Wenn nicht: extend.
9. **Tests** für audit-entity-mapping (mirror existing `agenda_instagram_export` pattern in `audit-entity.test.ts`).
10. **Backward-compat Garantie**: Bestehende Tests grün — keine Verhaltensänderung für Code-Paths die Block-IDs nicht referenzieren.
11. **Manueller Smoke auf Staging**:
    - **DK-11a**: Bestehender Eintrag öffnen → editieren → speichern → reload. IDs stabil über mehrere Edit-Zyklen (verifiziert via `psql SELECT content_i18n FROM agenda_items WHERE id = <test-id>` — Block-IDs unchanged).
    - **DK-11b**: Neuer Eintrag erstellen → Body schreiben → speichern → reload → editieren → speichern. IDs stabil.
12. **Codex PR-Review** — clean (1 Runde erwartet, kleine Surface).
13. **Stale-Code-Grep**: `rg -n 'data-bid' src/app/dashboard/components/RichTextEditor.tsx src/app/dashboard/components/journal-html-converter.ts` zeigt **3+ Hits** (sanitizer whitelist + bidAttr emit + readBidOrGenerate parse).

---

## Architektur

### Layer 1 — `journal-html-converter.ts`

```ts
function bidAttr(id: string | undefined): string {
  return id ? ` data-bid="${escapeAttr(id)}"` : "";
}

export function blocksToHtml(blocks: JournalContent): string {
  return blocks.map((block) => {
    const bid = bidAttr(block.id);
    switch (block.type) {
      case "paragraph":
        return `<p${bid}>${textNodesToHtml(block.content)}</p>`;
      case "heading":
        return `<h${block.level}${bid}>${textNodesToHtml(block.content)}</h${block.level}>`;
      case "quote": {
        const attrAttr = block.attribution
          ? ` data-attribution="${escapeAttr(block.attribution)}"`
          : "";
        return `<blockquote${bid}${attrAttr}><p>${textNodesToHtml(block.content)}</p></blockquote>`;
      }
      case "highlight":
        return `<p${bid} data-block="highlight">${textNodesToHtml(block.content)}</p>`;
      case "caption":
        return `<p${bid} data-block="caption">${textNodesToHtml(block.content)}</p>`;
      case "image":
      case "video":
      case "embed":
      case "spacer":
        // Non-text-blocks: bleiben non-overridable, aber data-bid für Konsistenz wenn id da ist.
        return /* existing markup mit ${bid} eingefügt */;
    }
  }).join("");
}

// In htmlToBlocks: jeder Block-Build verwendet readBidOrGenerate(el):
function readBidOrGenerate(el: Element): string {
  const bid = el.getAttribute("data-bid");
  if (bid && /^b[0-9a-z]+-[0-9a-z]+$/.test(bid)) return bid;  // strict format check
  return id();  // fallback for legacy HTML or invalid format
}
```

### Layer 2 — `RichTextEditor.tsx::sanitizeHtml`

Existing line 75-77 erweitern:

```ts
// Strip all attributes except safe ones
for (const attr of Array.from(el.attributes)) {
  if (tag === "a" && ["href", "target", "rel", "download"].includes(attr.name)) continue;
  if (tag === "img" && ["src", "alt"].includes(attr.name)) continue;
  if (tag === "video" && ["controls", "src", "data-mime"].includes(attr.name)) continue;
  if (tag === "source" && ["src", "type"].includes(attr.name)) continue;
  if (tag === "iframe" && ["src", "allowfullscreen", "frameborder"].includes(attr.name)) continue;
  if (tag === "p" && ["data-block", "data-size"].includes(attr.name)) continue;
  if (tag === "blockquote" && attr.name === "data-attribution") continue;
  if (tag === "figure" && ["data-width", "data-media"].includes(attr.name)) continue;
  // NEU: data-bid für ALLE block-tags die htmlToBlocks als Block-Quelle nutzt.
  if (["p", "h2", "h3", "blockquote", "figure"].includes(tag) && attr.name === "data-bid") continue;
  el.removeAttribute(attr.name);
}
```

### Layer 3 — `journal-validation.ts::validateBlock`

Keine Code-Änderung. **Doc-Note in Spec/Code-Comment**: "Block-IDs sind opaque strings (`b<ts>-<n>` ist canonical generator output, andere Formate via data-bid roundtrip ebenfalls valide). Future UUID-only validation würde Layout-Overrides break."

### `AuditEvent` Extension — `src/lib/audit.ts`

```ts
// VORHER (line 14-25):
export type AuditEvent =
  | "admin_login_success"
  | "admin_login_failure"
  | ... // 12 existing
  | "agenda_instagram_export";

// NACHHER:
export type AuditEvent =
  | "admin_login_success"
  | ... // 12 existing
  | "agenda_instagram_export"
  | "agenda_layout_update"      // NEU (S0 prerequisite for S1)
  | "agenda_layout_reset";      // NEU (S0 prerequisite for S1)
```

### `audit-entity.ts::extractAuditEntity` Mapping

```ts
// Existing pattern für agenda_instagram_export wird für die zwei neuen Events repliziert:
case "agenda_layout_update":
case "agenda_layout_reset":
  return {
    entity_type: "agenda_items",
    entity_id: typeof details.agenda_id === "number" ? details.agenda_id : null,
  };
```

---

## Tests

### `journal-html-converter.test.ts` — DK-3 + DK-5

```ts
import { sanitizeHtml } from "./RichTextEditor";  // erwarten: export hinzufügen wenn nicht da

describe("Block-ID Stabilität", () => {
  it("blocksToHtml emittiert data-bid auf paragraph/heading/quote/highlight/caption", () => {
    const blocks: JournalContent = [
      { id: "id-1", type: "paragraph", content: [{ text: "p" }] },
      { id: "id-2", type: "heading", level: 2, content: [{ text: "h" }] },
      { id: "id-3", type: "quote", content: [{ text: "q" }] },
      { id: "id-4", type: "highlight", content: [{ text: "hl" }] },
      { id: "id-5", type: "caption", content: [{ text: "cp" }] },
    ];
    const html = blocksToHtml(blocks);
    expect(html).toContain('data-bid="id-1"');
    expect(html).toContain('data-bid="id-2"');
    expect(html).toContain('data-bid="id-3"');
    expect(html).toContain('data-bid="id-4"');
    expect(html).toContain('data-bid="id-5"');
  });

  it("htmlToBlocks liest data-bid zurück (canonical format)", () => {
    const html = '<p data-bid="b1abc-x">x</p><h2 data-bid="b1abc-y">y</h2>';
    const blocks = htmlToBlocks(html);
    expect(blocks.map((b) => b.id)).toEqual(["b1abc-x", "b1abc-y"]);
  });

  it("Legacy HTML ohne data-bid bekommt frisch generierte ID via id() fallback", () => {
    const blocks = htmlToBlocks("<p>old</p><h2>old</h2>");
    blocks.forEach((b) => expect(b.id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/));
  });

  it("Invalid data-bid Format (nicht b<ts>-<n>) bekommt frisch generierte ID", () => {
    const blocks = htmlToBlocks('<p data-bid="not-our-format">x</p>');
    expect(blocks[0].id).not.toBe("not-our-format");
    expect(blocks[0].id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/);
  });

  it("3-Layer Round-Trip preserves IDs durch sanitizeHtml über N=5 Zyklen", () => {
    const original: JournalContent = [
      { id: "stable-1", type: "paragraph", content: [{ text: "x" }] },
      { id: "stable-2", type: "heading", level: 2, content: [{ text: "y" }] },
      { id: "stable-3", type: "blockquote", content: [{ text: "z" }] },
      { id: "stable-4", type: "highlight", content: [{ text: "w" }] },
      { id: "stable-5", type: "caption", content: [{ text: "v" }] },
    ];
    let blocks = original;
    for (let i = 0; i < 5; i++) {
      const html = blocksToHtml(blocks);
      const sanitized = sanitizeHtml(html);  // ← simuliert contentEditable + emitChange()
      blocks = htmlToBlocks(sanitized);
    }
    expect(blocks.map((b) => b.id)).toEqual(original.map((b) => b.id));
  });
});
```

### `RichTextEditor.test.tsx` — DK-3 Layer 2

```ts
it("sanitizeHtml preserves data-bid on p/h2/h3/blockquote/figure", () => {
  const out = sanitizeHtml('<p data-bid="x1">a</p><h2 data-bid="x2">b</h2><blockquote data-bid="x3"><p>c</p></blockquote>');
  expect(out).toContain('data-bid="x1"');
  expect(out).toContain('data-bid="x2"');
  expect(out).toContain('data-bid="x3"');
});

it("sanitizeHtml strips other unknown attributes (regression-guard)", () => {
  const out = sanitizeHtml('<p data-foo="evil" data-bid="ok">x</p>');
  expect(out).not.toContain('data-foo');
  expect(out).toContain('data-bid="ok"');
});
```

### `audit-entity.test.ts` — DK-9

```ts
it("agenda_layout_update → entity_type=agenda_items + entity_id", () => {
  const result = extractAuditEntity("agenda_layout_update", { agenda_id: 42 });
  expect(result).toEqual({ entity_type: "agenda_items", entity_id: 42 });
});

it("agenda_layout_reset → entity_type=agenda_items + entity_id", () => {
  const result = extractAuditEntity("agenda_layout_reset", { agenda_id: 42 });
  expect(result).toEqual({ entity_type: "agenda_items", entity_id: 42 });
});

it("agenda_layout_* mit fehlendem agenda_id → entity_id null", () => {
  const result = extractAuditEntity("agenda_layout_update", {});
  expect(result.entity_id).toBeNull();
});
```

---

## Risk Surface

| Risiko | Mitigation |
|---|---|
| **Bestand-Einträge mit IDs ohne canonical Format** | `readBidOrGenerate` regex check — invalid IDs werden re-generiert. Test deckt Fall ab. Bestand bleibt funktional. |
| **`data-bid` Round-Trip-Fehler in irgendeinem code-path den wir vergessen haben** | 3-Layer-Test mit 5 Zyklen + Manual-Smoke DK-11a/b auf Staging. |
| **`AuditEvent` Union-Erweiterung bricht andere Code-Stellen** | tsc-check fängt das auf. Existing audit-entity-tests bleiben grün (mapping ist exhaustive switch). |
| **Sanitizer-Whitelist-Edit triggert Sicherheitsbedenken** | data-bid ist passive metadata (kein `href`/`src`/script-trigger). XSS-Surface = 0. |

**Blast Radius**: SMALL. Nur `journal-html-converter.ts` + `RichTextEditor.tsx` (sanitizer line) + `audit.ts` Union + `audit-entity.ts` switch — 4 Files, ~20 LOC Production-Code, ~14 Tests.

---

## Implementation Order

1. **AuditEvent Union extension** (`src/lib/audit.ts`) — 2 Zeilen
2. **`audit-entity.ts` mapping** — 5 Zeilen + Tests
3. **`journal-html-converter.ts` data-bid emission + parsing** — `bidAttr` helper, `readBidOrGenerate` helper, `blocksToHtml` updates, `htmlToBlocks` updates
4. **`RichTextEditor.tsx::sanitizeHtml`** — single line addition für data-bid whitelist
5. **3-Layer Round-Trip Test** — invokes blocksToHtml → sanitizeHtml → htmlToBlocks
6. **`pnpm tsc --noEmit` + `pnpm test`** + commit
7. **Push → Staging-Deploy → DK-11a/b Manual Smoke**
8. **Codex PR-Review** — clean expected (1 Runde)
9. **Merge nach grünem Codex + post-merge Verifikation**

---

## Out of Scope (kommt in S1/S2)

- DB-Schema `instagram_layout_i18n JSONB` — **S1**
- Pure Resolver `resolveInstagramSlides` + `flattenContentWithIds` + `computeLayoutHash` — **S1**
- 3 API-Routes `/instagram-layout` GET/PUT/DELETE — **S1**
- Modal Layout-Tab UI mit dirty-detect, in-modal-confirm, etc. — **S2**
- Bestehende Routen auf Resolver umstellen — **S1**
- Manueller Smoke für Layout-Override-Workflow (DK-12..15 aus v3) — **S2**

---

## Dependency Chain

```
S0 (this) → S1 (Backend) → S2 (Modal UI) → Layout-Override-Feature live
```

S1 darf NICHT starten bis S0 merged. S2 darf NICHT starten bis S1 merged.

---

## Notes

- Source: tasks/instagram-layout-overrides-spec-v3-reference.md (split per Sonnet R3 SPLIT recommendation)
- v3-Reference enthält detaillierte Spec-Pseudocode für S1 + S2 — kann beim Schreiben dieser Specs als Quelle dienen
- Sonnet-Reviews v1/v2/v3 history in `tasks/qa-report.md` (wird von S0-Hook neu geschrieben)
- Codex-Spec-Eval: optional nach Sonnet-Approval auf S0 — kleiner Sprint, vermutlich nicht nötig
