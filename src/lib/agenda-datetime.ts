/**
 * Canonical-Formate für Agenda-Einträge:
 *   datum: "DD.MM.YYYY"       (z.B. "02.05.2026") — typografisch-DE, plus strict civil-date
 *   zeit:  "HH:MM Uhr"        (z.B. "14:00 Uhr")  — typografisch-DE mit Space
 *
 * Storage (agenda_items.datum/zeit) UND API-Input UND Dashboard-Render-String
 * folgen dem gleichen Canonical. Public-Renderer druckt die Strings as-is.
 *
 * Legacy-Normalizer existiert nur für `zeit` — Prod-Beobachtung: alle
 * Datum-Einträge sind bereits canonical, aber die Zeit-Spalte enthält
 * Varianten wie `"14:00Uhr"` (ohne Space), `"19.30"` (Punkt statt
 * Doppelpunkt, kein "Uhr"). `normalizeLegacyZeit` wird ausschließlich
 * in der einmaligen Migration verwendet, nicht im Live-Write-Pfad.
 *
 * Pure, edge-safe — keine Node-only Imports.
 */

export type DatumParts = { day: number; month: number; year: number };
export type ZeitParts = { hours: number; minutes: number };

const CANONICAL_DATUM_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const CANONICAL_ZEIT_RE = /^(\d{2}):(\d{2}) Uhr$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Civil-date check via Date.UTC roundtrip. Lehnt impossible Dates ab:
 * 29.02.2025 (non-leap), 31.02.*, 31.04.*, 31.06.*, 31.09.*, 31.11.*.
 * Leap-year-Logik ist im Date.UTC builtin bereits korrekt.
 */
function isValidCivilDate(day: number, month: number, year: number): boolean {
  if (year < 1900 || year > 2999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const ms = Date.UTC(year, month - 1, day);
  if (Number.isNaN(ms)) return false;
  const d = new Date(ms);
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** `"2026-05-02"` → `{day, month, year}` oder null (Regex+Civil-Check). */
export function parseIsoDate(iso: string): DatumParts | null {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidCivilDate(day, month, year)) return null;
  return { day, month, year };
}

/** `"14:00"` → `{hours, minutes}` oder null. 00:00–23:59. */
export function parseIsoTime(iso: string): ZeitParts | null {
  const m = ISO_TIME_RE.exec(iso);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `{day:2, month:5, year:2026}` → `"02.05.2026"`. */
export function formatCanonicalDatum(p: DatumParts): string {
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

/** `{hours:14, minutes:0}` → `"14:00 Uhr"`. */
export function formatCanonicalZeit(p: ZeitParts): string {
  return `${pad2(p.hours)}:${pad2(p.minutes)} Uhr`;
}

/**
 * Canonical "DD.MM.YYYY" → ISO "YYYY-MM-DD" für `<input type="date" value>`.
 * Null bei off-spec-Input — Caller (Form-Adapter) rendert dann leeren Picker
 * + Legacy-Row-Hinweis.
 */
export function datumToIsoInput(canonical: string): string | null {
  const m = CANONICAL_DATUM_RE.exec(canonical);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!isValidCivilDate(day, month, year)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Canonical "HH:MM Uhr" → ISO "HH:MM" für `<input type="time" value>`.
 * Null bei off-spec.
 */
export function zeitToIsoInput(canonical: string): string | null {
  const m = CANONICAL_ZEIT_RE.exec(canonical);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${m[1]}:${m[2]}`;
}

/**
 * Strict Canonical-Datum-Check inkl. Civil-Date-Validierung.
 * Wird als API-Gate für POST + PUT verwendet — impossible dates
 * (29.02.2025, 31.04.xxxx, …) werden abgelehnt.
 */
export function isCanonicalDatum(s: string): boolean {
  const m = CANONICAL_DATUM_RE.exec(s);
  if (!m) return false;
  return isValidCivilDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Strict Canonical-Zeit-Check: "HH:MM Uhr" mit Space, 24h-Range. */
export function isCanonicalZeit(s: string): boolean {
  const m = CANONICAL_ZEIT_RE.exec(s);
  if (!m) return false;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Nimmt Legacy-Zeit-Varianten und gibt Canonical zurück oder null.
 * Abgedeckte Varianten (Prod-beobachtet):
 *   "14:00 Uhr"  → "14:00 Uhr"   (already canonical, identity)
 *   "14:00Uhr"   → "14:00 Uhr"   (missing space)
 *   "14:00"      → "14:00 Uhr"   (missing suffix)
 *   "19.30"      → "19:30 Uhr"   (period separator, no suffix)
 *   "19.30 Uhr"  → "19:30 Uhr"   (period separator, suffix present)
 *
 * Wird NUR in der one-time Migration aufgerufen; nicht im API-Write-Pfad.
 */
/**
 * Is the canonical `datum` today or in the future, evaluated in Zurich
 * timezone? Returns false for off-format input. `today` is injectable
 * for deterministic tests — production callers pass the current Date
 * (default) and get TZ-correct behavior automatically.
 */
export function isUpcomingDatum(datum: string, today: Date = new Date()): boolean {
  const m = CANONICAL_DATUM_RE.exec(datum);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!isValidCivilDate(day, month, year)) return false;

  // Extract Y/M/D in Europe/Zurich so a midnight-rollover happens on the
  // Swiss-local boundary, not UTC. `formatToParts` avoids manual offset
  // math that breaks around DST transitions.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(today);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "NaN");
  const tYear = pick("year");
  const tMonth = pick("month");
  const tDay = pick("day");

  // Lexicographic compare on (year, month, day) tuple — robust, no Date
  // construction in the hot path.
  if (year !== tYear) return year > tYear;
  if (month !== tMonth) return month > tMonth;
  return day >= tDay;
}

export function normalizeLegacyZeit(s: string): string | null {
  const trimmed = s.trim();
  if (isCanonicalZeit(trimmed)) return trimmed;
  // Strip optional "Uhr" suffix (with or without leading whitespace).
  const withoutSuffix = trimmed.replace(/\s*Uhr\s*$/i, "").trim();
  // Accept either ":" or "." as hour/minute separator.
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(withoutSuffix);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return formatCanonicalZeit({ hours, minutes });
}
