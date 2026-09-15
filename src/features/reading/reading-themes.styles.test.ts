import { beforeAll, describe, expect, it, vi } from "vitest";
import { themes } from "./reading-preferences";

/** Themes without a `data-theme` block inherit the `.app-shell` base tokens. */
const baseTokenTheme = "paper";

let appStyles = "";

function readBlock(header: string) {
  const start = appStyles.indexOf(header);
  expect(start, `${header} 규칙이 App.css에 없습니다.`).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = start; index < appStyles.length; index += 1) {
    if (appStyles[index] === "{") {
      depth += 1;
    } else if (appStyles[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return appStyles.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${header} 규칙이 닫히지 않았습니다.`);
}

function readTokenNames(block: string) {
  return new Set(
    [...block.matchAll(/(--[a-z0-9-]+):/gu)]
      .map((match) => match[1])
      .filter((token) => !token.startsWith("--reading-")),
  );
}

beforeAll(async () => {
  const { readFileSync } = await vi.importActual<{
    readFileSync: (path: string, encoding: "utf8") => string;
  }>("node:fs");
  appStyles = readFileSync("src/app/App.css", "utf8");
});

describe("reading theme styles", () => {
  it("keeps every selectable theme paired with a swatch", () => {
    const listedThemes = themes.map((theme) => theme.value).sort();
    const swatchThemes = [
      ...appStyles.matchAll(
        /\.theme-option\[data-theme-option="([a-z-]+)"\]/gu,
      ),
    ]
      .map((match) => match[1])
      .sort();

    expect(swatchThemes).toEqual(listedThemes);
  });

  it("defines the full token set for every theme that overrides the base", () => {
    const baseTokens = readTokenNames(readBlock(".app-shell {"));

    for (const theme of themes) {
      if (theme.value === baseTokenTheme) {
        continue;
      }

      const themeTokens = readTokenNames(
        readBlock(`.app-shell[data-theme="${theme.value}"] {`),
      );

      expect(
        [...baseTokens].filter((token) => !themeTokens.has(token)),
        `${theme.value} 테마에 빠진 토큰이 있습니다.`,
      ).toEqual([]);
    }
  });

  it("keeps the monochrome theme free of any hue", () => {
    const monoBlock = readBlock('.app-shell[data-theme="mono"] {');
    const monoSwatch = readBlock('.theme-option[data-theme-option="mono"] {');
    const coloredValues: string[] = [];

    for (const declaration of `${monoBlock}${monoSwatch}`.matchAll(
      /(--[a-z0-9-]+):\s*([^;]+);/gu,
    )) {
      const [, token, value] = declaration;

      for (const [, hex] of value.matchAll(/#([0-9a-f]{6})\b/giu)) {
        const channels = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
        if (new Set(channels.map((part) => part.toLowerCase())).size > 1) {
          coloredValues.push(`${token}: #${hex}`);
        }
      }

      for (const [, channelList] of value.matchAll(/rgba?\(([^)]+)\)/giu)) {
        const [red, green, blue] = channelList
          .split(",")
          .map((part) => part.trim());
        if (new Set([red, green, blue]).size > 1) {
          coloredValues.push(`${token}: rgba(${channelList})`);
        }
      }
    }

    expect(coloredValues).toEqual([]);
  });
});
