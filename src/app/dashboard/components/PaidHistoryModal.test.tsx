// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PaidHistoryModal } from "./PaidHistoryModal";

afterEach(() => cleanup());

function stubAuditFetch(rows: unknown[]) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: rows }),
  })) as unknown as typeof fetch;
}

const rowFixture = {
  id: 1,
  event: "membership_paid_toggle",
  actor_email: "a.very.long.email.address@example.com",
  details: { paid: true },
  created_at: "2026-04-10T10:00:00.000Z",
};

beforeEach(() => {
  stubAuditFetch([rowFixture]);
});

describe("PaidHistoryModal — row class-string invariant", () => {
  it("<li> has 'flex flex-col gap-1 min-[400px]:flex-row min-[400px]:items-baseline min-[400px]:gap-3'", async () => {
    const { container } = render(
      <PaidHistoryModal target={{ id: 1, label: "Anna Beispiel" }} onClose={() => {}} />,
    );
    // Wait for fetch → setRows to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const li = container.querySelector<HTMLLIElement>("ul.divide-y > li");
    expect(li).toBeTruthy();
    const cls = li!.className;
    expect(cls).toMatch(/\bflex\b/);
    expect(cls).toMatch(/\bflex-col\b/);
    expect(cls).toMatch(/\bgap-1\b/);
    expect(cls).toMatch(/min-\[400px\]:flex-row/);
    expect(cls).toMatch(/min-\[400px\]:items-baseline/);
    expect(cls).toMatch(/min-\[400px\]:gap-3/);
  });

  it("Email span has min-[400px]:max-w-[14rem] + min-[400px]:truncate but no unconditional max-w-[14rem]", async () => {
    const { container } = render(
      <PaidHistoryModal target={{ id: 1, label: "Anna Beispiel" }} onClose={() => {}} />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const spans = container.querySelectorAll<HTMLSpanElement>("ul.divide-y > li > span");
    // Second span is the email.
    const emailSpan = spans[1];
    expect(emailSpan).toBeTruthy();
    const cls = emailSpan.className;
    expect(cls).toMatch(/min-\[400px\]:max-w-\[14rem\]/);
    expect(cls).toMatch(/min-\[400px\]:truncate/);
    // No unconditional max-w-[14rem] or truncate — those are min-400 only.
    // We check by stripping all min-[400px]: prefixes and asserting no bare token left.
    const stripped = cls
      .split(/\s+/)
      .filter((t) => !t.startsWith("min-[400px]:"))
      .join(" ");
    expect(stripped).not.toMatch(/\bmax-w-\[14rem\]\b/);
    expect(stripped).not.toMatch(/\btruncate\b/);
  });
});

describe("PaidHistoryModal — empty + error states unchanged", () => {
  it("empty state shows the 'recently introduced' hint", async () => {
    stubAuditFetch([]);
    render(
      <PaidHistoryModal target={{ id: 1, label: "Anna Beispiel" }} onClose={() => {}} />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Noch keine Aktionen protokolliert/)).toBeTruthy();
  });
});
