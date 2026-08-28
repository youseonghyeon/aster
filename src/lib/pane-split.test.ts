import { describe, expect, it } from "vitest";
import {
  clampSplitPercent,
  getKeyboardSplitPercent,
  getPointerSplitPercent,
  getSwappedSplitPercent,
  hasMeaningfulSplitDrag,
} from "./pane-split";

describe("pane split policies", () => {
  it("keeps each pane at least 240px wide", () => {
    expect(clampSplitPercent(0, 1000, false)).toBe(24);
    expect(clampSplitPercent(100, 1000, false)).toBe(75.1);
    expect(clampSplitPercent(60, 1000, false)).toBe(60);
  });

  it("uses an even split for stacked or constrained workspaces", () => {
    expect(clampSplitPercent(20, 1000, true)).toBe(50);
    expect(clampSplitPercent(20, 489, false)).toBe(50);
  });

  it("converts pointer coordinates without committing tiny movement", () => {
    expect(getPointerSplitPercent(500, 100, 800)).toBe(50);
    expect(hasMeaningfulSplitDrag(100, 101)).toBe(false);
    expect(hasMeaningfulSplitDrag(100, 102)).toBe(true);
  });

  it("supports keyboard steps and boundaries", () => {
    expect(getKeyboardSplitPercent(50, "ArrowLeft", false)).toBe(48);
    expect(getKeyboardSplitPercent(50, "ArrowRight", true)).toBe(60);
    expect(getKeyboardSplitPercent(50, "Home", false)).toBe(0);
    expect(getKeyboardSplitPercent(50, "End", false)).toBe(100);
    expect(getKeyboardSplitPercent(50, "Enter", false)).toBeNull();
  });

  it("mirrors the requested ratio when panes swap", () => {
    expect(getSwappedSplitPercent(35)).toBe(65);
    expect(getSwappedSplitPercent(72)).toBe(28);
  });
});
