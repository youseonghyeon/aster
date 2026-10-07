import { beforeAll, describe, expect, it, vi } from "vitest";

let appStyles = "";

beforeAll(async () => {
  const { readFileSync } = await vi.importActual<{
    readFileSync: (path: string, encoding: "utf8") => string;
  }>("node:fs");
  appStyles = readFileSync("src/app/App.css", "utf8");
});

describe("Markdown preview styles", () => {
  it("uses the shared theme token for native text selections", () => {
    expect(appStyles).toMatch(
      /\.markdown-body::selection,\s*\.markdown-body \*::selection\s*\{[^}]*background:\s*var\(--selection\)/u,
    );
  });

  it("removes the native bullet marker so it cannot paint a selection highlight", () => {
    expect(appStyles).toMatch(/\.markdown-body ul\s*\{\s*list-style-type:\s*none;\s*\}/u);
    expect(appStyles).not.toMatch(/\.markdown-body ul > li::marker/u);
  });

  it("provides document styles for safe raw HTML elements", () => {
    expect(appStyles).toMatch(/\.markdown-body details\s*\{/u);
    expect(appStyles).toMatch(/\.markdown-body summary\s*\{/u);
    expect(appStyles).toMatch(/\.markdown-body kbd\s*\{/u);
    expect(appStyles).toMatch(/\.markdown-body dl,/u);
  });
});
