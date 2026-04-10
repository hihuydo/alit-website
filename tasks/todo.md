# Sprint: Admin Dashboard
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-10 -->

## Phase 1: Foundation
- [ ] `pnpm add pg bcryptjs jose` + `@types/pg @types/bcryptjs`
- [ ] Agenda-Daten aus `AgendaPanel.tsx` in `src/content/agenda.ts` extrahieren
- [ ] `src/lib/db.ts` — PostgreSQL Connection Pool
- [ ] `src/lib/schema.ts` — CREATE TABLE IF NOT EXISTS für alle 4 Tabellen
- [ ] `src/lib/seed.ts` — Migration aus bestehenden TS-Dateien
- [ ] `src/instrumentation.ts` — Schema-Bootstrap + Seed bei leerem DB

## Phase 2: Auth
- [ ] `src/lib/auth.ts` — bcrypt + JWT Helpers
- [ ] `src/app/api/auth/login/route.ts` + `logout/route.ts`
- [ ] `src/middleware.ts` — Dashboard Route Protection
- [ ] `src/app/dashboard/login/page.tsx` — Login UI
- [ ] Admin-User Bootstrap via env vars

## Phase 3: Dashboard API
- [ ] CRUD Routes: `/api/dashboard/agenda/` + `[id]/`
- [ ] CRUD Routes: `/api/dashboard/journal/` + `[id]/`
- [ ] CRUD Routes: `/api/dashboard/projekte/` + `[id]/`
- [ ] Input Validation Helpers

## Phase 4: Dashboard UI
- [ ] `src/app/dashboard/layout.tsx` — Shell mit Auth-Check
- [ ] `src/app/dashboard/page.tsx` — 3-Tab Container
- [ ] Agenda: Liste + Formular + Modal
- [ ] Journal: Liste + Formular + Modal
- [ ] Projekte: Liste + Formular + Modal

## Phase 5: Frontend-Migration
- [ ] `AgendaPanel` → Props aus DB-Query
- [ ] `Wrapper`/Layout → Journal-Entries aus DB
- [ ] `ProjekteList` → Projekte aus DB
- [ ] Alte Content-Dateien archivieren

## Phase 6: Deploy
- [ ] PostgreSQL User + DB auf VPS anlegen
- [ ] `pg_hba.conf` Eintrag für Docker-Bridge
- [ ] `docker-compose.yml` env vars ergänzen
- [ ] Seed auf Production ausführen + verifizieren
- [ ] Dashboard Login + CRUD testen
