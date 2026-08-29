import { describe, expect, it, vi } from "vitest";
import { createAppEventChannel } from "./app-events";

describe("app event channel", () => {
  it("isolates listener failures and removes subscriptions", () => {
    const events = createAppEventChannel();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const survivingListener = vi.fn();
    const unsubscribeFailure = events.subscribe("document-committed", () => {
      throw new Error("listener failure");
    });
    const unsubscribeSurvivor = events.subscribe(
      "document-committed",
      survivingListener,
    );
    const payload = {
      kind: "open" as const,
      previousPath: null,
      path: "/docs/next.md",
    };

    events.emit("document-committed", payload);
    unsubscribeFailure();
    unsubscribeSurvivor();
    events.emit("document-committed", payload);

    expect(error).toHaveBeenCalledOnce();
    expect(survivingListener).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
