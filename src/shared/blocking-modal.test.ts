import { describe, expect, it } from "vitest";
import { createBlockingModalController } from "./blocking-modal";

describe("blocking modal controller", () => {
  it("tracks nested registrations and releases each one once", () => {
    const controller = createBlockingModalController();
    expect(controller.isOpen()).toBe(false);

    const releaseFirst = controller.register();
    const releaseSecond = controller.register();
    expect(controller.isOpen()).toBe(true);

    releaseFirst();
    releaseFirst();
    expect(controller.isOpen()).toBe(true);

    releaseSecond();
    expect(controller.isOpen()).toBe(false);
  });
});
