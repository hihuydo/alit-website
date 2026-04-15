export const ALLOWED_HASHTAGS = [
  "lyriktalk",
  "lyriktisch",
  "zürcherliteraturwerkstatt",
  "schweizerliteraturwerkstatt",
  "reihederautor:innen",
  "weltenliteratur",
  "essaisagités",
  "discoursagités",
  "netzwerkfuerliteratur*en",
] as const;

export const ALLOWED_HASHTAG_SET = new Set<string>(ALLOWED_HASHTAGS);

export interface AgendaHashtag {
  tag: string;
  projekt_slug: string;
}

/** DB storage shape post-Sprint-3: per-hashtag i18n label.
 *  `tag_i18n.de` is the canonical key (must be in ALLOWED_HASHTAG_SET).
 *  `tag_i18n.fr` is the free-form FR display label. */
export interface AgendaHashtagI18n {
  tag_i18n: { de: string; fr?: string | null };
  projekt_slug: string;
}
