import { describe, expect, it } from "vitest";

const sourceFiles = import.meta.glob("../**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const productionSources = Object.entries(sourceFiles).filter(
  ([path]) => !path.includes(".test.") && !path.includes("/test/"),
);

function importSpecifiers(source: string) {
  return Array.from(
    source.matchAll(
      /(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/g,
    ),
    (match) => match[1],
  );
}

function resolveRelativeImport(sourcePath: string, specifier: string) {
  if (!specifier.startsWith(".")) return null;
  const segments = sourcePath.split("/");
  segments.pop();
  for (const segment of specifier.split("/")) {
    if (segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function featureName(path: string) {
  return path.match(/\/features\/([^/]+)/)?.[1] ?? null;
}

describe("source architecture boundaries", () => {
  it("keeps features independent from the app root and sibling features", () => {
    const violations: string[] = [];

    for (const [path, source] of productionSources) {
      const owner = featureName(path);
      if (!owner) continue;
      for (const specifier of importSpecifiers(source)) {
        const resolved = resolveRelativeImport(path, specifier);
        if (!resolved) continue;
        const dependency = featureName(resolved);
        if (resolved.includes("/app/") || (dependency && dependency !== owner)) {
          violations.push(`${path} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps shared and feature-neutral layers independent from features", () => {
    const violations: string[] = [];
    const neutralLayerPattern = /\/(shared|components|hooks|lib)\//;

    for (const [path, source] of productionSources) {
      if (!neutralLayerPattern.test(path)) continue;
      for (const specifier of importSpecifiers(source)) {
        const resolved = resolveRelativeImport(path, specifier);
        if (
          resolved &&
          (resolved.includes("/features/") || resolved.includes("/app/"))
        ) {
          violations.push(`${path} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps App as a composition root", () => {
    const appSource = sourceFiles["./App.tsx"] ?? sourceFiles["../app/App.tsx"];
    const forbiddenOwnershipPatterns = [
      ["document operation refs", /\b(?:documentOperationRef|markdownRef|loadedMarkdownRef|noteRef|documentPathRef|documentGenerationRef|markdownEditVersionRef|recentDocumentsRef|recentStatusBatchRef)\b/],
      ["document transaction handlers", /\b(?:handleReloadExternalFile|switchToMarkdownDocument|handleOpenFile|handleRecentDocumentSelect|promoteOpenedDocument)\b/],
      ["document storage or gateway modules", /(?:document-session-state|markdown-files|recent-documents)/],
      ["preference persistence", /\b(?:localStorage|readingPreferenceStorageKey|themeStorageKey|fontStorageKey|lineSpacingStorageKey|zoomStorageKey)\b/],
      ["native event ownership", /\b(?:listen|unlisten)\s*\(/],
      ["active element ownership", /\bdocument\.activeElement\b/],
      ["DOM querying ownership", /\.(?:querySelector|querySelectorAll)\s*\(/],
      ["selection restoration", /\b(?:selectionStart|selectionEnd|selectionDirection|setSelectionRange)\b/],
      ["scroll restoration", /\.(?:scrollTop|scrollLeft|scrollTo|scrollIntoView)\b/],
      ["raw state ownership", /\b(?:dispatch|reducerDispatch|setMarkdown|setNote|setDocumentPath|setRecentDocuments)\b/],
    ] as const;

    expect(appSource).toBeDefined();
    expect(appSource).not.toMatch(
      /\buse(?:State|Reducer|Effect|LayoutEffect|DeferredValue|Memo)\b/,
    );
    expect(appSource).not.toMatch(/(?:window|document)\.addEventListener/);
    expect(appSource.split("\n").length).toBeLessThanOrEqual(250);
    expect(
      forbiddenOwnershipPatterns
        .filter(([, pattern]) => pattern.test(appSource))
        .map(([label]) => label),
    ).toEqual([]);
  });

  it("keeps the document session hook as a bounded coordinator", () => {
    const sessionSource =
      sourceFiles["../features/documents/useDocumentSession.ts"];

    expect(sessionSource).toBeDefined();
    expect(sessionSource.split("\n").length).toBeLessThanOrEqual(450);
    expect(sessionSource).not.toMatch(
      /\b(?:chooseMarkdownSavePath|saveMarkdownFile|promoteRecentDocument|saveRecentDocuments)\b/,
    );
  });

  it("includes dynamic imports in boundary analysis", () => {
    expect(
      importSpecifiers('const module = import("../features/reading/module")'),
    ).toEqual(["../features/reading/module"]);
  });

  it("does not restore legacy root and generic component locations", () => {
    expect(Object.keys(sourceFiles)).not.toEqual(
      expect.arrayContaining([
        "../App.tsx",
        "../components/AppHeader.tsx",
        "../components/DocumentStage.tsx",
        "../components/DocumentSidebar.tsx",
        "../components/DocumentOutline.tsx",
        "../components/PaneDivider.tsx",
        "../components/WorkspacePane.tsx",
      ]),
    );
  });
});
