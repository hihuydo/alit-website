# Plan: Deploy alit-website to Hetzner VPS

## Context
Die alit-website ist fertig gebaut (Next.js, Tailwind v4, 8 Seiten de/fr). Sie muss auf den Hetzner VPS "hd-server" deployed werden (Docker + nginx vorhanden). Domain: `alit.hihuydo.com`. Später kommt ein Admin-Dashboard mit SQLite — das Docker-Setup soll dafür schon vorbereitet sein.

## Ansatz: Next.js Standalone + Docker

`output: "export"` → `output: "standalone"` umstellen. So braucht das Docker-Setup später keine Änderung wenn der Admin dazukommt.

## Dateien

### Ändern
- **`next.config.ts`** — `output: "standalone"`, `trailingSlash: true` beibehalten

### Neu erstellen
| Datei | Zweck |
|-------|-------|
| `Dockerfile` | Multi-stage: pnpm install → build → Node.js standalone runner |
| `docker-compose.yml` | Container `alit-web` auf `127.0.0.1:3100:3000`, nginx proxy |
| `.dockerignore` | node_modules, .next, .git, _reference, tasks, memory |
| `nginx/alit.conf` | Reverse proxy → :3100, SSL, static asset caching |
| `.github/workflows/deploy.yml` | Auto-deploy via `appleboy/ssh-action` bei push auf main |

### Dockerfile-Strategie
```
Stage 1 (deps):    node:22-alpine + pnpm, install deps
Stage 2 (builder): copy deps + source, pnpm build
Stage 3 (runner):  node:22-alpine, copy standalone + static + public, run as non-root
```

### GitHub Actions
- Trigger: push auf `main`
- `concurrency: cancel-in-progress: true`
- SSH auf Server → `git pull` → `docker compose build` → `docker compose up -d`
- Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`

## Server-Setup (manuell, einmalig)
1. `/opt/apps/alit-website` erstellen, Repo klonen
2. nginx config → `/etc/nginx/sites-available/` (oder in nginx Container mounten)
3. DNS: A-Record `alit.hihuydo.com` → Server-IP
4. SSL: `certbot --nginx -d alit.hihuydo.com`
5. Deploy Key für GitHub einrichten
6. GitHub Secrets setzen

## Verifikation
- `docker compose build && docker compose up -d`
- `curl -I http://127.0.0.1:3100` → 200
- `https://alit.hihuydo.com` im Browser: alle Seiten, Fonts, Panel-Toggle
- Push auf main → GitHub Action → auto-deploy
