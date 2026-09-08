import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveUpdateReadingResume, takeUpdateReadingResume } from "./update-reading-resume";
vi.mock("./preview-scroll-anchor", () => ({ capturePreviewReadingAnchor: (container: HTMLElement) => ({
  container, sourceOffset: "42", blockProgress: .5, viewportOffset: 10, scrollProgress: .3, scrollTop: 200,
  textAnchor: { text: "읽던 내용", offset: 2, viewportTop: 10 },
}) }));
beforeEach(() => localStorage.clear());
describe("restart reading position", () => {
  it("restores a serializable text anchor onto the new container only once", () => {
    const old = document.createElement("div"), next = document.createElement("div");
    saveUpdateReadingResume(old, "/doc.md", "문서 내용");
    const result = takeUpdateReadingResume(next, "/doc.md", "문서 내용");
    expect(result?.container).toBe(next);
    expect(result?.sourceOffset).toBe("42");
    expect(result?.textAnchor?.text).toBe("읽던 내용");
    expect(takeUpdateReadingResume(next, "/doc.md", "문서 내용")).toBeNull();
  });
  it("does not restore an anchor into another document or changed content", () => {
    const el = document.createElement("div");
    saveUpdateReadingResume(el, "/doc.md", "원문");
    expect(takeUpdateReadingResume(el, "/other.md", "원문")).toBeNull();
    saveUpdateReadingResume(el, "/doc.md", "원문");
    expect(takeUpdateReadingResume(el, "/doc.md", "바뀐 문서")).toBeNull();
  });
  it("propagates storage failures so installation can be stopped", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
    expect(() => saveUpdateReadingResume(document.createElement("div"), "/doc.md", "원문")).toThrow();
  });
});
