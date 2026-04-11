# Spec: Staging-Environment
<!-- Created: 2026-04-11 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Staging-Environment auf dem Hetzner VPS einrichten, damit Feature-Branches vor dem Merge live getestet werden können. Zweiter Docker-Container auf separatem Port, eigener nginx vhost unter `staging.alit.hihuydo.com`, gleiche DB. GitHub Action baut Staging automatisch bei Push auf nicht-main Branches.

## Context
- Production: Docker Container `alit-web`, Port 3100 → nginx `alit.conf` → `alit.hihuydo.com`
- CI/CD: `deploy.yml` triggert bei Push auf `main` → SSH → git pull → build → up
- DB: PostgreSQL auf Host, Container greift via `host.docker.internal` zu
- Server-Pfad: `/opt/apps/alit-website`
- Env vars in `/opt/apps/alit-website/.env`: DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH
- Zweite nginx-Config `alit.hihuydo.com` (Port 80, static SPA) ist veraltet — `alit.conf` mit SSL ist die aktive

## Requirements

### Must Have
1. `docker-compose.staging.yml` — Container `alit-staging` auf Port 3102, mit `extra_hosts: ["host.docker.internal:host-gateway"]` (identisch zu Production — ohne das löst `host.docker.internal` im Container nicht auf und die DB-Connection schlägt fehl)
2. nginx vhost `staging.alit.hihuydo.com` mit SSL (Certbot), proxy auf Port 3102
3. `.github/workflows/deploy-staging.yml` — triggered bei Push auf alle Branches außer `main`
4. Staging nutzt dieselbe `.env` (gleiche DB, gleiche Auth)
5. Staging-Deploys lassen Production-Container unberührt

### Nice to Have
1. Cleanup-Action: Staging-Container stoppen nach PR-Merge

### Out of Scope
- Separate Staging-DB
- Preview-URLs pro PR (ein Staging reicht)
- Automatische PR-Kommentare mit Preview-Link

## Technical Approach

### Files to Create/Change

| File | Change Type | Description |
|------|-------------|-------------|
| `docker-compose.staging.yml` | Create | Staging-Container (Port 3102, Name `alit-staging`) |
| `.github/workflows/deploy-staging.yml` | Create | GitHub Action: SSH → checkout Branch → build staging |
| Server: nginx vhost | Create | `staging.alit.hihuydo.com` → 127.0.0.1:3102 |
| Server: DNS | Prüfen | A-Record für `staging.alit.hihuydo.com` |
| Server: `/opt/apps/alit-website-staging/` | Create | Separates Verzeichnis mit eigenem Git-Checkout |

### Architecture Decisions
- **Separates Verzeichnis `/opt/apps/alit-website-staging/`** — eigener Git-Checkout, damit Production-Checkout auf `main` bleibt
- **Separate `docker-compose.staging.yml`** statt zweiter Service in Haupt-Compose — Production bleibt unangetastet
- **Gleiche `.env`** — Symlink oder Kopie aus Production. Gleiche DB, gleicher JWT → Dashboard-Login funktioniert auch auf Staging
- **Port 3102** — nächster freier Port nach Production (3100)
- **`concurrency: deploy-staging` mit `cancel-in-progress`** — bei schnellen Pushes gewinnt der neueste

### Deploy-Flow Staging
```
Push auf Feature-Branch
  → deploy-staging.yml triggered
  → SSH auf Server
  → cd /opt/apps/alit-website-staging
  → git fetch origin && git checkout origin/<branch> --force
  → git clean -fdx -e .env      # untracked Dateien von vorherigen Branches entfernen, .env behalten
  → docker compose -f docker-compose.staging.yml build
  → docker compose -f docker-compose.staging.yml up -d
  → docker image prune -f
```

### Server-Setup (einmalig)
1. Repo klonen: `git clone <repo> /opt/apps/alit-website-staging`
2. Env verlinken: `ln -s /opt/apps/alit-website/.env /opt/apps/alit-website-staging/.env`
3. nginx vhost anlegen + Certbot SSL
4. DNS: A-Record für `staging.alit.hihuydo.com` → 135.181.85.55

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Zwei Feature-Branches pushen schnell nacheinander | `cancel-in-progress` → neuerer Push gewinnt |
| Staging-Container crasht | `restart: unless-stopped` |
| Push auf main | Nur `deploy.yml` triggert |
| Branch gelöscht | Staging bleibt auf letztem Stand stehen |
| Gleichzeitiger Prod- und Staging-Build | Kein Konflikt — separate Verzeichnisse und Container |

## Risks
- **DB-Schreibzugriffe über Staging-Dashboard** — beide Environments teilen die DB. Akzeptabel, da nur ein Admin (User selbst) Zugriff hat.
