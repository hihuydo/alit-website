# Sprint: Staging-Environment
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-11 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `docker-compose.staging.yml` existiert mit Container `alit-staging` auf Port 3102
- [ ] `.github/workflows/deploy-staging.yml` triggert bei Push auf nicht-main Branches
- [ ] `.github/workflows/deploy-staging.yml` triggert NICHT bei Push auf main
- [ ] Staging-Container auf Server läuft und ist erreichbar unter `staging.alit.hihuydo.com`
- [ ] Production-Container `alit-web` läuft unverändert weiter nach Staging-Deploy
- [ ] SSL-Zertifikat für `staging.alit.hihuydo.com` ist aktiv
- [ ] Push auf Feature-Branch baut Staging automatisch

## Tasks

### Phase 1: Dateien im Repo
- [ ] `docker-compose.staging.yml` erstellen
- [ ] `.github/workflows/deploy-staging.yml` erstellen

### Phase 2: Server-Setup (einmalig)
- [ ] Repo klonen nach `/opt/apps/alit-website-staging`
- [ ] `.env` verlinken
- [ ] nginx vhost `staging.alit.hihuydo.com` anlegen
- [ ] DNS A-Record prüfen/anlegen
- [ ] Certbot SSL für `staging.alit.hihuydo.com`

### Phase 3: Verifizierung
- [ ] Push auf Branch → Staging baut automatisch
- [ ] `staging.alit.hihuydo.com` zeigt die Staging-Version
- [ ] `alit.hihuydo.com` zeigt weiterhin Production
