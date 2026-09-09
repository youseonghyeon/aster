import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentSidebar } from "./DocumentSidebar";

it("connects recent document scrolling and preserves selection and the modal focus boundary", () => {
  const document = { path: "/docs/한글.md", name: "한글.md", lastOpenedAt: "2026-09-09T00:00:00Z" };
  const select = vi.fn();
  render(<DocumentSidebar documents={[document]} currentDocumentPath={null}
    unavailableDocumentPaths={new Set()} isModal isBusy={false} isPersistenceLimited={false}
    onClose={vi.fn()} onFilesView={vi.fn()} onOpenFile={vi.fn()} onSelectDocument={select} />);
  const viewport = screen.getByRole("tabpanel");
  expect(viewport).toHaveAttribute("data-overlay-scrollbar", "true");
  Object.defineProperties(viewport, {
    clientWidth: { value: 200 }, clientHeight: { value: 200 },
    scrollWidth: { value: 200 }, scrollHeight: { value: 800 },
  });
  fireEvent.scroll(viewport);
  fireEvent.keyDown(screen.getByRole("scrollbar", { name: "최근 문서 세로 스크롤" }), { key: "End" });
  expect(viewport.scrollTop).toBe(600);
  fireEvent.click(screen.getByRole("button", { name: "한글.md" }));
  expect(select).toHaveBeenCalledWith(document);
  screen.getByRole("button", { name: "Markdown 파일 열기" }).focus();
  fireEvent.keyDown(window.document.activeElement ?? viewport, { key: "Tab" });
  expect(screen.getByRole("button", { name: "최근 문서 닫기" })).toHaveFocus();
});
