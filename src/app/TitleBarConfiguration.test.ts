import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureMacosTitleBar,
  type MacosTitleBarWindow,
} from "./title-bar";

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
  beforeEach(() => {
    delete document.documentElement.dataset.platform;
    delete document.documentElement.dataset.windowFullscreen;
  });

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

  it("releases the traffic light space while the native window is fullscreen", () => {
    expect(appStyles).toMatch(
      /html\[data-platform="macos"\]\[data-window-fullscreen="true"\] \.header-leading\s*\{[^}]*padding-left:\s*0/u,
    );
  });

  it("tracks native fullscreen changes from window resize events", async () => {
    let isFullscreen = true;
    let resizeHandler:
      | Parameters<MacosTitleBarWindow["onResized"]>[0]
      | undefined;
    const unlisten = vi.fn();
    const appWindow = {
      isFullscreen: vi.fn(async () => isFullscreen),
      onResized: vi.fn(async (handler: NonNullable<typeof resizeHandler>) => {
        resizeHandler = handler;
        return unlisten;
      }),
    };

    const dispose = await configureMacosTitleBar({
      appWindow,
      root: document.documentElement,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    });

    expect(document.documentElement.dataset.platform).toBe("macos");
    expect(document.documentElement.dataset.windowFullscreen).toBe("true");

    isFullscreen = false;
    resizeHandler?.({} as never);

    await vi.waitFor(() => {
      expect(document.documentElement.dataset.windowFullscreen).toBeUndefined();
    });

    dispose();
    expect(unlisten).toHaveBeenCalledOnce();
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
