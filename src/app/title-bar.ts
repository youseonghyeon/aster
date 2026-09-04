import { getCurrentWindow } from "@tauri-apps/api/window";

const MACOS_USER_AGENT_PATTERN = /Macintosh|Mac OS X/u;

export type MacosTitleBarWindow = Pick<
  ReturnType<typeof getCurrentWindow>,
  "isFullscreen" | "onResized"
>;

type ConfigureMacosTitleBarOptions = {
  appWindow?: MacosTitleBarWindow;
  root?: HTMLElement;
  userAgent?: string;
};

export async function configureMacosTitleBar({
  appWindow,
  root = document.documentElement,
  userAgent = navigator.userAgent,
}: ConfigureMacosTitleBarOptions = {}): Promise<() => void> {
  if (!MACOS_USER_AGENT_PATTERN.test(userAgent)) return () => undefined;

  root.dataset.platform = "macos";

  const currentWindow = appWindow ?? getCurrentWindow();
  let disposed = false;
  let refreshVersion = 0;
  let unlisten: (() => void) | undefined;

  const refreshFullscreenState = async () => {
    const version = ++refreshVersion;

    try {
      const isFullscreen = await currentWindow.isFullscreen();
      if (disposed || version !== refreshVersion) return;

      if (isFullscreen) {
        root.dataset.windowFullscreen = "true";
      } else {
        delete root.dataset.windowFullscreen;
      }
    } catch {
      // Browser-only development has no native window to query.
    }
  };

  try {
    unlisten = await currentWindow.onResized(() => {
      void refreshFullscreenState();
    });
  } catch {
    // Browser-only development has no native window events to subscribe to.
  }

  await refreshFullscreenState();

  return () => {
    disposed = true;
    unlisten?.();
  };
}
