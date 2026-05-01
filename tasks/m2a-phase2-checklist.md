# M2a — Phase 2 Operator-Checklist

> **Voraussetzung:** PR feat/signup-mail-notifications gemergedt + prod-deployed (Phase 1 — graceful-degrade aktiv, kein Mail-Versand).
>
> **Ziel von Phase 2:** alit.ch auf Mailu eingerichtet, DNS propagiert, ENV befüllt, Container neu hochgezogen → Mails fliegen.

---

## Schritt 1 — Domain alit.ch auf Mailu (hd-server)

- [ ] In Mailu UI als Domain-Admin: **Domain alit.ch hinzufügen**.
- [ ] **DKIM-Key generieren** für alit.ch. Mailu zeigt einen DNS-TXT-Record-String mit Public-Key — kopieren für Schritt 2.
- [ ] **Mailbox `info@alit.ch` anlegen** (Passwort merken — kommt in Schritt 4 in `.env`).
- [ ] (Optional) Aliases einrichten falls weitere alit-Adressen geplant sind (post@alit.ch, admin@alit.ch …).

---

## Schritt 2 — DNS-Records für alit.ch

> Beim Domain-Registrar von alit.ch (vermutlich Cyon/Hostpoint/Switch) folgende DNS-Records eintragen.

- [ ] **MX-Record:** `alit.ch.` → `mail.hihuydo.com.` (Priorität 10).
- [ ] **SPF (TXT) auf `alit.ch`:** `v=spf1 mx -all`
- [ ] **DMARC (TXT) auf `_dmarc.alit.ch`:** `v=DMARC1; p=quarantine; rua=mailto:info@alit.ch`
  - **Phase 2a:** mit `p=none` starten (nur Reports) für ~1 Woche, dann auf `p=quarantine`. Bei stable green: `p=reject`.
- [ ] **DKIM (TXT) auf `<selector>._domainkey.alit.ch`:** Wert aus Mailu-Schritt-1 (Selector heißt z.B. `dkim` — Mailu gibt's an).

**Verifikations-Commands** (auf Dev-Maschine, NACHDEM DNS propagiert ist — kann 5min–24h dauern):
```bash
dig +short MX alit.ch
# → 10 mail.hihuydo.com.

dig +short TXT alit.ch | grep spf
# → "v=spf1 mx -all"

dig +short TXT _dmarc.alit.ch
# → "v=DMARC1; p=quarantine; rua=mailto:info@alit.ch"

dig +short TXT dkim._domainkey.alit.ch
# → "v=DKIM1; k=rsa; p=<long-base64-key>"
```

Alle 4 müssen Werte zurückgeben bevor weiter.

---

## Schritt 3 — ENV auf Prod + Staging befüllen

> **Wichtig:** `.env` auf hd-server liegt unter `/opt/apps/alit-website/.env` (prod) und `/opt/apps/alit-website-staging/.env` (staging). chmod 600.

In **beiden** `.env`-Files folgende 7 Vars setzen:

```env
SMTP_HOST=mail.hihuydo.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@alit.ch
SMTP_PASS=<password aus Mailu-Schritt 1>
SMTP_FROM=info@alit.ch
MEMBERSHIP_NOTIFY_RECIPIENT=info@alit.ch
```

**SPF/DMARC-Alignment-Guard:** `SMTP_FROM` MUSS auf `alit.ch` enden — `lib/mail.ts::resolveSenderAddress()` throwt sonst und cached null (transporter wird nicht initialisiert, alle subsequent sendMail returnen `{accepted: false, reason: "send-failed"}`).

---

## Schritt 4 — Container neu hochziehen (NICHT restart)

```bash
ssh hd-server
cd /opt/apps/alit-website-staging  # erst Staging
docker compose up -d alit-staging
docker compose logs --tail=30 alit-staging
# Erwarte: "[instrumentation] Bootstrap complete" + KEINE "[mail] SMTP not configured" warning.

# Wenn Staging-Logs clean:
cd /opt/apps/alit-website
docker compose up -d alit-web
docker compose logs --tail=30 alit-web
```

⚠️ **NICHT `docker compose restart`** — Compose liest `.env` nur bei `up` neu (siehe `memory/lessons.md` 2026-04-18).

---

## Schritt 5 — Smoke-Test: Echte Mails versenden

### 5a — Newsletter-Anmeldung (einfacher Test, kein DB-Side-Effect-Cleanup nötig)

Auf Staging:
1. https://staging.alit.hihuydo.com/de/projekte/discours-agites/ öffnen
2. Newsletter-Form ausfüllen mit **Test-Email die DU kontrollierst** (z.B. eigene Gmail/Outlook).
3. Anmelden klicken.

**Erwartet innerhalb 30s:**
- [ ] Mail an Test-Email mit Subject „Newsletter-Anmeldung bei alit"
- [ ] Mail an info@alit.ch mit Subject „Neue Newsletter-Anmeldung: Vorname Nachname"

**Inbox-vs-Spam-Check (KRITISCH):**
- [ ] Test-Email in Gmail: landet in Inbox (nicht Spam-Ordner)
- [ ] Test-Email in Outlook: landet in Inbox
- [ ] Test-Email in iCloud-Mail: landet in Inbox
- [ ] In Gmail-Mail-Header: SPF=PASS, DKIM=PASS, DMARC=PASS
  (Im Gmail: Mail öffnen → 3-Punkte-Menü → „Original anzeigen" → SPF/DKIM/DMARC checken)

### 5b — Mitgliedschaft-Anmeldung

1. https://staging.alit.hihuydo.com/de/mitgliedschaft/ öffnen
2. Form ausfüllen mit Test-Daten (Vorname/Nachname/Adresse/Email).
3. Anmelden.

**Erwartet:**
- [ ] Mail an Test-Email: „Anmeldung bei alit erhalten" mit Wording „Nach Eingang Deiner Zahlung bestätigen wir Dir Deine Mitgliedschaft im Netzwerk für Literatur*en"
- [ ] Mail an info@alit.ch: „Neue Mitgliedschafts-Anmeldung: Vorname Nachname" mit Form-Tabelle (Vorname/Nachname/Strasse/PLZ Stadt/Email)

### 5c — Audit-Verifikation (DB)

Auf hd-server:
```bash
docker exec -it alit-staging-db psql -U alit_user -d alit -c \
  "SELECT created_at, event, details->'mail_recipient_kind' as kind, \
          details->'mail_accepted' as accepted, details->'mail_error_reason' as err \
   FROM audit_events WHERE event='signup_mail_sent' \
   ORDER BY created_at DESC LIMIT 10;"
```

Jeder erfolgreiche Test-Signup produziert genau **2 Rows**: eine `kind=user, accepted=true`, eine `kind=admin, accepted=true`.

Wenn `accepted=false`: `err` zeigt den Grund (`send-failed`, `not-configured`, oder echte Fehlermeldung von SMTP). Logs in `docker compose logs alit-staging | grep "\[mail\]"` für SMTP-Fehler-Stack.

### 5d — DB-Cleanup nach Smoke

```bash
docker exec -it alit-staging-db psql -U alit_user -d alit -c \
  "DELETE FROM newsletter_subscribers WHERE email='deine-test-email@gmail.com'; \
   DELETE FROM memberships WHERE email='deine-test-email@gmail.com';"
```

---

## Schritt 6 — Prod-Cutover (nur nach grüner Staging-Smoke)

1. Schritt 3 + 4 für `/opt/apps/alit-website/.env` wiederholen.
2. Smoke wie 5a/5b auf https://alit.hihuydo.com — diesmal mit DB-Cleanup ZWINGEND danach.
3. Audit-Stream beobachten für die ersten ~7 Tage:
   ```bash
   ssh hd-server "docker exec alit-db psql -U alit_user -d alit -c \
     \"SELECT date_trunc('day',created_at) as d, \
              details->>'mail_accepted' as accepted, count(*) \
       FROM audit_events WHERE event='signup_mail_sent' \
       AND created_at > NOW() - INTERVAL '7 days' \
       GROUP BY 1,2 ORDER BY 1 DESC;\""
   ```
   Wenn `accepted=false` ungewöhnlich oft: SMTP/Mailu hat ein Problem.

---

## Rollback-Plan (falls Phase 2 schiefgeht)

Mails fliegen kaputt → Newsletter-User kriegen nichts oder DKIM/SPF brechen → User-Beschwerden.

**Schneller Rollback:**
```bash
ssh hd-server
cd /opt/apps/alit-website
nano .env
# Zeile `SMTP_HOST=mail.hihuydo.com` umbiegen zu `SMTP_HOST=`
docker compose up -d alit-web
```

Damit ist Phase 1 graceful-degrade wieder aktiv: Signups laufen 200 OK, keine Mails, audit zeigt `mail_accepted=null`. Du kannst danach in Ruhe debuggen.

DNS-Records lass ruhig stehen (machen erst dann Schaden wenn auch SMTP_HOST wieder gesetzt wird).
