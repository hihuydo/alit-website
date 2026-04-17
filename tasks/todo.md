# Sprint: external_url Field entfernen
<!-- Spec: tasks/spec.md v1 -->
<!-- Started: 2026-04-17 -->

## Done-Kriterien

### Code-Removal
- [ ] `ProjekteSection.tsx`: Type + emptyForm + openEdit + 2× Submit + Input-UI
- [ ] `projekte/route.ts` POST: body + INSERT
- [ ] `projekte/[id]/route.ts` PUT: body + SET-Clause
- [ ] `queries.ts::getProjekte()`: SELECT + output
- [ ] `content/projekte.ts`: Projekt + ProjektSeed types + 4 Seed-externalUrls
- [ ] `seed.ts`: INSERT ohne external_url
- [ ] `schema.ts`: CREATE TABLE-Zeile raus + DROP COLUMN IF EXISTS

### Tests + Build
- [ ] 165/165 grün
- [ ] pnpm build clean

### Manuelle Smoke-Tests (Staging)
- [ ] **S1 Edit-Form** zeigt kein URL-Input
- [ ] **S2 DB-Schema** hat kein external_url
- [ ] **S3 Public-Projekt-Detail** rendert 200
- [ ] **S4 Dashboard CRUD** Create + Edit klappt
- [ ] **S5 Re-Boot** idempotent

### Prod-Deploy
- [ ] CI grün
- [ ] `/api/health/` 200
- [ ] Smoke S1-S5 analog auf Prod
- [ ] Log clean

## Notes

- Dead-Feature-Removal — Field wird nirgends gerendert. Direkter DROP ohne Soak-Zyklus sicher.
- 4 Prod-URLs gehen aus DB verloren (essais-agites, unsere-schweiz, dunkelkammern, poetische-schweiz). Git-history + Spec dokumentiert sie. Admin kann sie via Editor als Inline-Link nachpflegen wenn gewünscht.
- Separater Sprint vor PR 2 (DROP 16 Legacy-Columns) — unterschiedliche Risiko-Klassen.
