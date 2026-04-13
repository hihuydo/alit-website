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
