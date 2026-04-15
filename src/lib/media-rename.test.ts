import { describe, expect, it } from "vitest";
import { applyRename } from "./media-rename";

const PDF = "application/pdf";
const ZIP = "application/zip";
const ZIP_MS = "application/x-zip-compressed";
const JPEG = "image/jpeg";

describe("applyRename — extension preservation", () => {
  it("keeps the original extension when the user supplies no extension", () => {
    expect(applyRename("invoice.pdf", PDF, "2026-Q1")).toBe("2026-Q1.pdf");
  });

  it("keeps the user's extension when it matches the original (case-insensitive)", () => {
    expect(applyRename("invoice.pdf", PDF, "2026-Q1.PDF")).toBe("2026-Q1.PDF");
    expect(applyRename("invoice.PDF", PDF, "2026-Q1.pdf")).toBe("2026-Q1.pdf");
  });

  it("replaces a wrong user-supplied extension with the original", () => {
    expect(applyRename("invoice.pdf", PDF, "2026-Q1.jpg")).toBe("2026-Q1.pdf");
  });

  it("drops only the final extension segment when replacing", () => {
    expect(applyRename("invoice.pdf", PDF, "my.report.jpg")).toBe("my.report.pdf");
  });
});

describe("applyRename — mime fallback for extensionless originals", () => {
  it("derives .pdf from mime when original has no extension", () => {
    expect(applyRename("bare-name", PDF, "2026-Q1")).toBe("2026-Q1.pdf");
  });

  it("derives .zip from application/zip", () => {
    expect(applyRename("bare-name", ZIP, "archive")).toBe("archive.zip");
  });

  it("derives .zip from Microsoft's application/x-zip-compressed variant", () => {
    expect(applyRename("bare-name", ZIP_MS, "archive")).toBe("archive.zip");
  });

  it("returns the user input unchanged for images (no mime-derived extension)", () => {
    // Images are uploaded with extensions in the normal flow, so the fallback
    // isn't needed. A rare bare-name image rename has nothing authoritative to
    // append — accept whatever the user typed.
    expect(applyRename("bare-image", JPEG, "new-name")).toBe("new-name");
  });
});

describe("applyRename — edge cases", () => {
  it("rejects an input that is only a dot", () => {
    expect(applyRename("invoice.pdf", PDF, ".")).toBe("");
  });

  it("rejects an input that is only underscores", () => {
    expect(applyRename("invoice.pdf", PDF, "__")).toBe("");
  });

  it("rejects an input that sanitizes down to only punctuation", () => {
    // Chars outside [a-zA-Z0-9._-] become "_" — "!!!" → "___" → no alphanum.
    expect(applyRename("invoice.pdf", PDF, "!!!")).toBe("");
  });

  it("rejects empty and whitespace-only input", () => {
    expect(applyRename("invoice.pdf", PDF, "")).toBe("");
    expect(applyRename("invoice.pdf", PDF, "   ")).toBe("");
  });

  it("sanitizes unsafe characters to underscores", () => {
    expect(applyRename("invoice.pdf", PDF, "2026 Q1/report")).toBe("2026_Q1_report.pdf");
  });

  it("trims leading and trailing whitespace", () => {
    expect(applyRename("invoice.pdf", PDF, "  2026-Q1  ")).toBe("2026-Q1.pdf");
  });

  it("treats a leading-dot-only filename as extensionless", () => {
    // lastIndexOf('.') at index 0 is skipped by extensionOf; with PDF mime
    // the fallback kicks in instead.
    expect(applyRename(".hidden", PDF, "renamed")).toBe("renamed.pdf");
  });

  it("ignores trailing-dot originals (no valid extension)", () => {
    // "foo." has no real extension — extensionOf returns "", mime fallback
    // supplies .pdf.
    expect(applyRename("foo.", PDF, "renamed")).toBe("renamed.pdf");
  });

  it("collapses a user-supplied extension to base when the base becomes empty", () => {
    // Input "2026-Q1" with no extension — sanitizer passes through, no
    // replacement needed; but if somehow the base would strip to "", the
    // fallback uses `clean` — covered by this regression case.
    expect(applyRename("invoice.pdf", PDF, ".pdf")).toBe(".pdf");
  });
});
