import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TextSearchResult } from "../lib/text-search";
import { useTextSearch } from "./useTextSearch";

type WorkerRequest = {
  id: number;
  value: string;
  query: string;
  options: {
    isCaseSensitive: boolean;
    isRegex: boolean;
  };
};

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  request: WorkerRequest | null = null;
  private messageListeners = new Set<(event: MessageEvent) => void>();
  private errorListeners = new Set<(event: Event) => void>();

  constructor() {
    ControlledWorker.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (type === "message") {
      this.messageListeners.add(listener as (event: MessageEvent) => void);
    } else if (type === "error") {
      this.errorListeners.add(listener);
    }
  }

  postMessage(request: WorkerRequest) {
    this.request = request;
  }

  terminate() {}

  emit(result: TextSearchResult) {
    const id = this.request?.id ?? -1;
    const event = { data: { id, result } } as MessageEvent;
    this.messageListeners.forEach((listener) => listener(event));
  }
}

describe("useTextSearch", () => {
  beforeEach(() => {
    ControlledWorker.instances = [];
    vi.stubGlobal("Worker", ControlledWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never exposes completed offsets for a different search signature", () => {
    const renderedResults: TextSearchResult[] = [];

    function Probe({
      value,
      query = "문서",
      isRegex = false,
    }: {
      value: string;
      query?: string;
      isRegex?: boolean;
    }) {
      const result = useTextSearch(value, query, {
        isCaseSensitive: false,
        isRegex,
      });
      renderedResults.push(result);
      return null;
    }

    const view = render(<Probe value="문서 하나" />);
    act(() => {
      ControlledWorker.instances[0].emit({
        matches: [{ start: 0, end: 2 }],
        error: null,
        isTruncated: false,
      });
    });
    expect(renderedResults[renderedResults.length - 1]?.matches).toEqual([
      { start: 0, end: 2 },
    ]);

    renderedResults.length = 0;
    view.rerender(<Probe value="완전히 다른 내용" />);

    expect(renderedResults.every((result) => result.matches.length === 0)).toBe(true);

    const staleWorker = ControlledWorker.instances[0];
    act(() => {
      staleWorker.emit({
        matches: [{ start: 0, end: 2 }],
        error: null,
        isTruncated: false,
      });
    });
    expect(renderedResults.every((result) => result.matches.length === 0)).toBe(true);

    act(() => {
      ControlledWorker.instances[1].emit({
        matches: [{ start: 4, end: 6 }],
        error: null,
        isTruncated: false,
      });
    });
    renderedResults.length = 0;
    view.rerender(<Probe value="완전히 다른 내용" query="다른" />);
    expect(renderedResults.every((result) => result.matches.length === 0)).toBe(true);

    renderedResults.length = 0;
    view.rerender(
      <Probe value="완전히 다른 내용" query="다른" isRegex />,
    );
    expect(renderedResults.every((result) => result.matches.length === 0)).toBe(true);
  });
});
