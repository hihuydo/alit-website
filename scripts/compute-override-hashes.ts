// Usage: pnpm exec tsx scripts/compute-override-hashes.ts <agenda_id> <de|fr> <imageCount>
// Reads the agenda row from DB, prints contentHash + suggested layoutVersion
// for the auto-mode override (so you can craft a manual override SQL with
// matching hashes for staging-smoke).
import "dotenv/config";
import pool from "../src/lib/db";
import {
  computeLayoutHash,
  computeLayoutVersion,
} from "../src/lib/instagram-overrides";
import {
  flattenContentWithIds,
  type AgendaItemForExport,
} from "../src/lib/instagram-post";

async function main() {
  const [, , idArg, localeArg, imageCountArg] = process.argv;
  const id = parseInt(idArg, 10);
  const locale = localeArg as "de" | "fr";
  const imageCount = parseInt(imageCountArg, 10);
  if (!id || !["de", "fr"].includes(locale) || !Number.isFinite(imageCount)) {
    console.error(
      "usage: compute-override-hashes.ts <id> <de|fr> <imageCount>",
    );
    process.exit(1);
  }
  const { rows } = await pool.query<AgendaItemForExport>(
    `SELECT id, datum, zeit, title_i18n, lead_i18n, ort_i18n, content_i18n,
            hashtags, images, images_grid_columns
       FROM agenda_items WHERE id=$1`,
    [id],
  );
  if (rows.length === 0) throw new Error(`agenda ${id} not found`);
  const item = rows[0];
  const ch = computeLayoutHash({ item, locale, imageCount });
  const blocks = flattenContentWithIds(item.content_i18n?.[locale] ?? null);
  const sampleOverride = {
    contentHash: ch,
    slides: [{ blocks: blocks.map((b) => b.id) }],
  };
  console.log(
    JSON.stringify(
      {
        contentHash: ch,
        blockIds: blocks.map((b) => b.id),
        layoutVersion: computeLayoutVersion(sampleOverride),
        sampleOverride,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
