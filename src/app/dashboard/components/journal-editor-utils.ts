export interface JournalMeta {
  /** Canonical DD.MM.YYYY (empty string = not set). Replaces the legacy
   *  freitext `date` field after the PR #103 canonical migration. */
  datum: string;
  author: string;
  title: string;
  title_border: boolean;
  footer: string;
}
