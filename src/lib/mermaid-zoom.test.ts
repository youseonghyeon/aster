import { describe, expect, it } from "vitest";
import {
  calculateFitMermaidZoomPercent,
  captureScrollViewportCenter,
  getNextMermaidZoomPercent,
  getScrollOffsetsForViewportCenter,
  getZoomedMermaidSvgSize,
  parseMermaidSvgViewBox,
} from "./mermaid-zoom";

describe("Mermaid zoom calculations", () => {
  it("parses a valid viewBox and rejects unusable dimensions", () => {
    expect(parseMermaidSvgViewBox("0 0 920.2 410.1")).toEqual({
      width: 920.2,
      height: 410.1,
    });
    expect(parseMermaidSvgViewBox("0, 0, 0, 40")).toBeNull();
    expect(parseMermaidSvgViewBox("invalid")).toBeNull();
  });

  it("uses ten-point zoom steps with exact range boundaries", () => {
    expect(getNextMermaidZoomPercent(25, -1)).toBe(25);
    expect(getNextMermaidZoomPercent(30, -1)).toBe(25);
    expect(getNextMermaidZoomPercent(25, 1)).toBe(35);
    expect(getNextMermaidZoomPercent(195, 1)).toBe(200);
    expect(getNextMermaidZoomPercent(200, 1)).toBe(200);
  });

  it("rounds scaled SVG dimensions upward", () => {
    expect(
      getZoomedMermaidSvgSize({ width: 920.2, height: 410.1 }, 110),
    ).toEqual({ width: 1013, height: 452 });
  });

  it("fits once within the viewport including canvas padding", () => {
    expect(
      calculateFitMermaidZoomPercent({
        baseWidth: 1000,
        viewportWidth: 520,
        paddingLeft: 20,
        paddingRight: 20,
      }),
    ).toBe(48);
    expect(
      calculateFitMermaidZoomPercent({
        baseWidth: 300,
        viewportWidth: 520,
        paddingLeft: 20,
        paddingRight: 20,
      }),
    ).toBe(100);
    expect(
      calculateFitMermaidZoomPercent({
        baseWidth: 999,
        viewportWidth: 499.6,
        paddingLeft: 0,
        paddingRight: 0,
      }),
    ).toBe(49);
    expect(
      calculateFitMermaidZoomPercent({
        baseWidth: 4000,
        viewportWidth: 400,
        paddingLeft: 20,
        paddingRight: 20,
      }),
    ).toBe(25);
    expect(
      calculateFitMermaidZoomPercent({
        baseWidth: 1000,
        viewportWidth: 0,
        paddingLeft: 20,
        paddingRight: 20,
      }),
    ).toBeNull();
  });

  it("captures and restores the visible center with clamping", () => {
    expect(
      captureScrollViewportCenter({
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 300,
        scrollHeight: 200,
        clientWidth: 300,
        clientHeight: 200,
      }),
    ).toEqual({ x: 0.5, y: 0.5 });

    const center = captureScrollViewportCenter({
      scrollLeft: 350,
      scrollTop: 150,
      scrollWidth: 1000,
      scrollHeight: 500,
      clientWidth: 300,
      clientHeight: 200,
    });
    expect(center).toEqual({ x: 0.5, y: 0.5 });
    expect(
      getScrollOffsetsForViewportCenter(center, {
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 1500,
        scrollHeight: 750,
        clientWidth: 300,
        clientHeight: 200,
      }),
    ).toEqual({ left: 600, top: 275 });
    expect(
      getScrollOffsetsForViewportCenter({ x: 1, y: 1 }, {
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 400,
        scrollHeight: 300,
        clientWidth: 300,
        clientHeight: 200,
      }),
    ).toEqual({ left: 100, top: 100 });
  });
});
