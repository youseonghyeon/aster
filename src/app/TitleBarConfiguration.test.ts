import { beforeAll, describe, expect, it, vi } from "vitest";

let appStyles = "";
let tauriConfig: {
  app: {
    windows: Array<Record<string, unknown>>;
  };
};
let defaultCapability: {
  permissions: string[];
};

beforeAll(async () => {
  const { readFileSync } = await vi.importActual<{
    readFileSync: (path: string, encoding: "utf8") => string;
  }>("node:fs");
  appStyles = readFileSync("src/app/App.css", "utf8");
  tauriConfig = JSON.parse(
    readFileSync("src-tauri/tauri.conf.json", "utf8"),
  ) as typeof tauriConfig;
  defaultCapability = JSON.parse(
    readFileSync("src-tauri/capabilities/default.json", "utf8"),
  ) as typeof defaultCapability;
});

describe("macOS integrated title bar", () => {
  it("uses an overlay title bar with positioned native window controls", () => {
    expect(tauriConfig.app.windows[0]).toMatchObject({
      decorations: true,
      hiddenTitle: true,
      titleBarStyle: "Overlay",
      trafficLightPosition: { x: 16, y: 29 },
    });
  });

  it("reserves header space for macOS traffic lights", () => {
    expect(appStyles).toMatch(
      /html\[data-platform="macos"\] \.header-leading\s*\{[^}]*padding-left:\s*60px/u,
    );
  });

  it("removes the redundant brand group from the macOS title bar", () => {
    expect(appStyles).toMatch(
      /html\[data-platform="macos"\] \.brand,\s*html\[data-platform="macos"\] \.header-group-divider\s*\{[^}]*display:\s*none/u,
    );
  });

  it("allows native window dragging from declared title bar regions", () => {
    expect(defaultCapability.permissions).toContain(
      "core:window:allow-start-dragging",
    );
  });
});
