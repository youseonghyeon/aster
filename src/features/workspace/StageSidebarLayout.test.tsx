import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageSidebarLayout } from "./StageSidebarLayout";

function renderLayout(
  onSidebarWidthChange = vi.fn(),
  isSidebarInset = true,
) {
  render(
    <StageSidebarLayout
      sidebar={<aside>파일</aside>}
      closeLabel="문서 탐색 닫기"
      isSidebarInset={isSidebarInset}
      sidebarWidth={280}
      onClose={vi.fn()}
      onSidebarWidthChange={onSidebarWidthChange}
    >
      <main>문서</main>
    </StageSidebarLayout>,
  );
  return onSidebarWidthChange;
}

afterEach(() => document.body.classList.remove("is-resizing-stage-sidebar"));

describe("StageSidebarLayout", () => {
  it("resizes an inset sidebar with keyboard controls", () => {
    const onWidthChange = renderLayout();
    const separator = screen.getByRole("separator", {
      name: "사이드바 너비 조절",
    });

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });

    expect(onWidthChange).toHaveBeenNthCalledWith(1, 292);
    expect(onWidthChange).toHaveBeenNthCalledWith(2, 220);
    expect(onWidthChange).toHaveBeenNthCalledWith(3, 420);
  });

  it("commits the pointer width only when the drag ends", () => {
    const onWidthChange = renderLayout();
    const separator = screen.getByRole("separator");

    fireEvent.pointerDown(separator, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(separator, { clientX: 356, pointerId: 1 });
    expect(onWidthChange).not.toHaveBeenCalled();
    expect(document.body).toHaveClass("is-resizing-stage-sidebar");

    fireEvent.pointerUp(separator, { clientX: 356, pointerId: 1 });
    expect(onWidthChange).toHaveBeenCalledWith(356);
    expect(document.body).not.toHaveClass("is-resizing-stage-sidebar");
  });

  it("does not expose a resizer while the sidebar is modal", () => {
    renderLayout(vi.fn(), false);

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("cleans up an active drag when the sidebar disappears", () => {
    const { rerender } = render(
      <StageSidebarLayout
        sidebar={<aside>파일</aside>}
        closeLabel="문서 탐색 닫기"
        isSidebarInset
        sidebarWidth={280}
        onClose={vi.fn()}
        onSidebarWidthChange={vi.fn()}
      >
        <main>문서</main>
      </StageSidebarLayout>,
    );
    fireEvent.pointerDown(screen.getByRole("separator"), {
      button: 0,
      pointerId: 1,
    });
    expect(document.body).toHaveClass("is-resizing-stage-sidebar");

    rerender(
      <StageSidebarLayout
        sidebar={null}
        closeLabel="문서 탐색 닫기"
        isSidebarInset
        sidebarWidth={280}
        onClose={vi.fn()}
        onSidebarWidthChange={vi.fn()}
      >
        <main>문서</main>
      </StageSidebarLayout>,
    );

    expect(document.body).not.toHaveClass("is-resizing-stage-sidebar");
  });
});
