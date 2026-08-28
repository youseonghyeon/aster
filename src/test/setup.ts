import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const mediaQueries = new Set<MockMediaQueryList>();

function matchesMediaQuery(query: string, width: number) {
  const minimumWidth = /\(min-width:\s*(\d+)px\)/u.exec(query)?.[1];
  const maximumWidth = /\(max-width:\s*(\d+)px\)/u.exec(query)?.[1];

  return (
    (!minimumWidth || width >= Number(minimumWidth)) &&
    (!maximumWidth || width <= Number(maximumWidth))
  );
}

class MockMediaQueryList {
  readonly media: string;
  onchange: ((event: MediaQueryListEvent) => void) | null = null;
  private listeners = new Set<EventListenerOrEventListenerObject>();
  matches: boolean;

  constructor(query: string) {
    this.media = query;
    this.matches = matchesMediaQuery(query, window.innerWidth);
  }

  addEventListener(
    _type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.listeners.delete(listener);
  }

  addListener(listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.add(listener as EventListener);
  }

  removeListener(listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.delete(listener as EventListener);
  }

  dispatchEvent(event: Event): boolean {
    this.listeners.forEach((listener) => {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    });
    this.onchange?.(event as MediaQueryListEvent);
    return true;
  }

  refresh(width: number) {
    const nextMatches = matchesMediaQuery(this.media, width);

    if (nextMatches === this.matches) {
      return;
    }

    this.matches = nextMatches;
    this.dispatchEvent(
      new Event("change") as MediaQueryListEvent,
    );
  }
}

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => {
    const mediaQuery = new MockMediaQueryList(query);
    mediaQueries.add(mediaQuery);
    return mediaQuery as unknown as MediaQueryList;
  },
});

export function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  mediaQueries.forEach((mediaQuery) => mediaQuery.refresh(width));
}

class MockResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
  configurable: true,
  value: MockResizeObserver,
});
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: MockResizeObserver,
});

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: {
    ready: Promise.resolve(),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});

if (!("highlights" in CSS)) {
  Object.defineProperty(CSS, "highlights", {
    configurable: true,
    value: new Map(),
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  mediaQueries.clear();
});
