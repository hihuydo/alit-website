# Plan: Admin Dashboard für alit-website

## Context
Die alit-website hat aktuell alle Inhalte hardcoded in TypeScript-Dateien. Es soll ein Admin Dashboard unter `/dashboard` entstehen, das CRUD für alle Content-Typen bietet. Das UI spiegelt die 3-Panel-Struktur der Website wider. PostgreSQL auf dem bestehenden Hetzner VPS als Datenbank.

## Datenbank-Schema (PostgreSQL)

### `admin_users`
```sql
CREATE TABLE admin_users (
  id         SERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `agenda_items`
```sql
CREATE TABLE agenda_items (
  id         SERIAL PRIMARY KEY,
  datum      TEXT NOT NULL,
  zeit       TEXT NOT NULL,
  ort        TEXT NOT NULL,
  ort_url    TEXT NOT NULL,
  titel      TEXT NOT NULL,
  beschrieb  JSONB NOT NULL DEFAULT '[]',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `journal_entries`
```sql
CREATE TABLE journal_entries (
  id           SERIAL PRIMARY KEY,
  date         TEXT NOT NULL,
  author       TEXT,
  title        TEXT,
  title_border BOOLEAN DEFAULT FALSE,
  lines        JSONB NOT NULL DEFAULT '[]',
  images       JSONB,
  footer       TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### `projekte`
```sql
CREATE TABLE projekte (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  titel        TEXT NOT NULL,
  kategorie    TEXT NOT NULL,
  paragraphs   JSONB NOT NULL DEFAULT '[]',
  external_url TEXT,
  archived     BOOLEAN DEFAULT FALSE,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

Design-Entscheidungen:
- JSONB für Arrays (lines, paragraphs, beschrieb) — keine Junction-Tables nötig
- Daten als TEXT — bestehende Formate sind inkonsistent und dienen nur der Anzeige
- `sort_order` für explizite Reihenfolge
- Kein i18n auf DB-Ebene — aktuell nur DE-Content, FR-Content kann später ergänzt werden

## Migration Hardcoded → DB

1. Agenda-Daten aus `AgendaPanel.tsx` in `src/content/agenda.ts` extrahieren
2. `src/lib/db.ts` — PostgreSQL Pool (`pg`, kein ORM)
3. `src/instrumentation.ts` — Schema-Bootstrap + Seed (nur wenn Tabellen leer)
4. Seed-Script importiert bestehende TS-Arrays per `INSERT ... ON CONFLICT DO NOTHING`
5. Frontend-Komponenten von statischen Imports auf DB-Queries umstellen

## Auth

- Dependencies: `pg`, `bcryptjs`, `jose`
- Login unter `/dashboard/login/`
- JWT in HttpOnly Cookie, 24h Expiry, HS256
- `src/middleware.ts` schützt alle `/dashboard/*` Routes
- Rate Limiting: In-Memory Map, 5 Versuche / 15 Min pro IP
- Admin-Bootstrap via `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` env vars

## API Routes

Next.js Route Handlers unter `src/app/api/dashboard/`:

- `GET/POST /api/dashboard/agenda/` + `PUT/DELETE /api/dashboard/agenda/[id]/`
- `GET/POST /api/dashboard/journal/` + `PUT/DELETE /api/dashboard/journal/[id]/`
- `GET/POST /api/dashboard/projekte/` + `PUT/DELETE /api/dashboard/projekte/[id]/`

Public-Frontend liest direkt aus der DB (Server Components), keine separaten Public-API-Endpoints.

## Dashboard UI

Route: `/dashboard/` (kein Locale-Prefix, admin-only)

3-Tab-Interface:
- **Tab "Agenda"** (rot) — CRUD für Events
- **Tab "Journal"** (schwarz) — CRUD für Discours-Agités-Einträge
- **Tab "Projekte"** (neutral) — CRUD für Projekte

Pro Tab: Liste + "Neu"-Button, Edit/Delete pro Item via Modal.

Komponenten:
```
src/app/dashboard/
  layout.tsx          — Auth-Check, Shell mit Logout
  page.tsx            — Tab-Container
  login/page.tsx      — Login-Formular
  components/
    DashboardTabs.tsx — Tab-Switching
    AgendaForm.tsx    — Create/Edit Agenda
    AgendaList.tsx    — Liste mit Actions
    JournalForm.tsx   — Create/Edit Journal
    JournalList.tsx   — Liste mit Actions
    ProjekteForm.tsx  — Create/Edit Projekte
    ProjekteList.tsx  — Liste mit Actions
    Modal.tsx         — Wiederverwendbar
    DeleteConfirm.tsx — Bestätigungsdialog
```

## Deployment

- PostgreSQL User + DB auf Hetzner VPS: `createuser alit`, `createdb -O alit alit`
- `pg_hba.conf`: `host alit alit 172.16.0.0/12 scram-sha-256`
- docker-compose: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` als env vars
- `host.docker.internal` für Container→Host DB-Zugang
- nginx braucht keine Änderung

## Phasen

### Phase 1: Foundation
- DB-Client (`src/lib/db.ts`), Schema-Bootstrap, Agenda-Daten extrahieren, Seed-Script
- `instrumentation.ts` für automatischen Bootstrap

### Phase 2: Auth
- Login/Logout, JWT, Middleware, Admin-Bootstrap

### Phase 3: Dashboard API
- CRUD-Routes für alle 3 Content-Types, Input Validation

### Phase 4: Dashboard UI
- Tab-Layout, Listen, Formulare, Modals

### Phase 5: Frontend-Migration
- Komponenten von static import → DB-Query umstellen
- Alte Content-Dateien als Backup behalten bis verifiziert

### Phase 6: Deploy
- pg_hba, env vars, Seed auf Production, Verifikation

## Verifikation
- Login funktioniert, Session wird korrekt gehalten
- CRUD für alle 3 Content-Types: Create, Read, Update, Delete
- Public-Website zeigt DB-Content korrekt an
- Seed-Migration: alle bestehenden Inhalte in DB übernommen
- Health-Endpoint weiterhin erreichbar
