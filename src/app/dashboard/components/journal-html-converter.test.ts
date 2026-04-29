// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { JournalContent } from "@/lib/journal-types";
import { blocksToHtml, htmlToBlocks } from "./journal-html-converter";
import { sanitizeHtml } from "./RichTextEditor";

describe("Block-ID Stabilität (S0)", () => {
  it("blocksToHtml emits data-bid on paragraph/heading/quote/highlight/caption", () => {
    const blocks: JournalContent = [
      { id: "b1abc-1", type: "paragraph", content: [{ text: "p" }] },
      { id: "b1abc-2", type: "heading", level: 2, content: [{ text: "h" }] },
      { id: "b1abc-3", type: "quote", content: [{ text: "q" }] },
      { id: "b1abc-4", type: "highlight", content: [{ text: "hl" }] },
      { id: "b1abc-5", type: "caption", content: [{ text: "cp" }] },
    ];
    const html = blocksToHtml(blocks);
    expect(html).toContain('data-bid="b1abc-1"');
    expect(html).toContain('data-bid="b1abc-2"');
    expect(html).toContain('data-bid="b1abc-3"');
    expect(html).toContain('data-bid="b1abc-4"');
    expect(html).toContain('data-bid="b1abc-5"');
  });

  it("blocksToHtml emits data-bid on figure for image/video/embed/spacer", () => {
    const blocks: JournalContent = [
      { id: "b1img-1", type: "image", src: "/x.jpg", alt: "x" },
      {
        id: "b1vid-1",
        type: "video",
        src: "/x.mp4",
        mime_type: "video/mp4",
      },
      { id: "b1emb-1", type: "embed", url: "https://example.com" },
      { id: "b1spc-1", type: "spacer", size: "m" },
    ];
    const html = blocksToHtml(blocks);
    expect(html).toContain('data-bid="b1img-1"');
    expect(html).toContain('data-bid="b1vid-1"');
    expect(html).toContain('data-bid="b1emb-1"');
    expect(html).toContain('data-bid="b1spc-1"');
  });

  it("htmlToBlocks reads data-bid back (canonical format)", () => {
    const html =
      '<p data-bid="b1abc-x">x</p><h2 data-bid="b1abc-y">y</h2>' +
      '<blockquote data-bid="b1abc-z"><p>z</p></blockquote>';
    const blocks = htmlToBlocks(html);
    expect(blocks.map((b) => b.id)).toEqual(["b1abc-x", "b1abc-y", "b1abc-z"]);
  });

  it("htmlToBlocks reads data-bid back on figure variants", () => {
    const html =
      '<figure data-bid="b1fig-1"><img src="/x.jpg" alt="x" /></figure>' +
      '<figure data-bid="b1fig-2" data-media="video"><video src="/x.mp4" data-mime="video/mp4"></video></figure>' +
      '<figure data-bid="b1fig-3" data-media="embed"><iframe src="https://example.com"></iframe></figure>';
    const blocks = htmlToBlocks(html);
    expect(blocks.map((b) => b.id)).toEqual([
      "b1fig-1",
      "b1fig-2",
      "b1fig-3",
    ]);
  });

  it("htmlToBlocks generates fresh ID via id() when data-bid missing (legacy HTML)", () => {
    const blocks = htmlToBlocks("<p>old</p><h2>old</h2><blockquote><p>q</p></blockquote>");
    blocks.forEach((b) => expect(b.id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/));
  });

  it("htmlToBlocks rejects malformed data-bid (defense against paste-in poisoning)", () => {
    const blocks = htmlToBlocks('<p data-bid="not-our-format">x</p>');
    expect(blocks[0].id).not.toBe("not-our-format");
    expect(blocks[0].id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/);
  });

  it("htmlToBlocks rejects empty data-bid", () => {
    const blocks = htmlToBlocks('<p data-bid="">x</p>');
    expect(blocks[0].id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/);
  });

  it("3-Layer round-trip preserves IDs across N=5 cycles", () => {
    const original: JournalContent = [
      { id: "b1stab-1", type: "paragraph", content: [{ text: "x" }] },
      { id: "b1stab-2", type: "heading", level: 2, content: [{ text: "y" }] },
      { id: "b1stab-3", type: "quote", content: [{ text: "z" }] },
      { id: "b1stab-4", type: "highlight", content: [{ text: "w" }] },
      { id: "b1stab-5", type: "caption", content: [{ text: "v" }] },
    ];
    let blocks: JournalContent = original;
    for (let i = 0; i < 5; i++) {
      const html = blocksToHtml(blocks);
      const sanitized = sanitizeHtml(html);
      blocks = htmlToBlocks(sanitized);
    }
    expect(blocks.map((b) => b.id)).toEqual(original.map((b) => b.id));
  });

  it("3-Layer round-trip preserves figure IDs (image)", () => {
    const original: JournalContent = [
      { id: "b1img-rt", type: "image", src: "/a.jpg", alt: "a", width: "full" },
    ];
    let blocks: JournalContent = original;
    for (let i = 0; i < 3; i++) {
      const html = blocksToHtml(blocks);
      const sanitized = sanitizeHtml(html);
      blocks = htmlToBlocks(sanitized);
    }
    expect(blocks.map((b) => b.id)).toEqual(["b1img-rt"]);
  });

  it("Mixed legacy + canonical IDs: canonical preserved, legacy regenerated", () => {
    const html =
      '<p>old paragraph</p>' +
      '<p data-bid="b1new-1">new paragraph</p>' +
      '<h2 data-bid="invalid-format">heading</h2>';
    const blocks = htmlToBlocks(html);
    expect(blocks[0].id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/);
    expect(blocks[0].id).not.toBe("b1new-1");
    expect(blocks[1].id).toBe("b1new-1");
    expect(blocks[2].id).toMatch(/^b[0-9a-z]+-[0-9a-z]+$/);
    expect(blocks[2].id).not.toBe("invalid-format");
  });
});

describe("sanitizeHtml — data-bid whitelist (S0)", () => {
  it("preserves data-bid on p/h2/h3/blockquote/figure", () => {
    const out = sanitizeHtml(
      '<p data-bid="b1-1">a</p>' +
        '<h2 data-bid="b1-2">b</h2>' +
        '<h3 data-bid="b1-3">c</h3>' +
        '<blockquote data-bid="b1-4"><p>d</p></blockquote>' +
        '<figure data-bid="b1-5"><img src="/x.jpg" alt="x" /></figure>',
    );
    expect(out).toContain('data-bid="b1-1"');
    expect(out).toContain('data-bid="b1-2"');
    expect(out).toContain('data-bid="b1-3"');
    expect(out).toContain('data-bid="b1-4"');
    expect(out).toContain('data-bid="b1-5"');
  });

  it("strips other unknown attributes (regression-guard)", () => {
    const out = sanitizeHtml('<p data-foo="evil" data-bid="ok">x</p>');
    expect(out).not.toContain("data-foo");
    expect(out).toContain('data-bid="ok"');
  });

  it("strips data-bid on tags outside the whitelist (br/img/etc)", () => {
    const out = sanitizeHtml(
      '<p><img data-bid="no" src="/x.jpg" alt="x" /></p>',
    );
    expect(out).not.toContain('data-bid="no"');
  });
});
