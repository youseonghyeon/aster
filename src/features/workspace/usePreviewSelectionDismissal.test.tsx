import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePreviewSelectionDismissal } from "./usePreviewSelectionDismissal";

function Harness() {
  const handlers = usePreviewSelectionDismissal();
  return (
    <div data-testid="preview" {...handlers}>
      <p>선택할 문장</p>
      <a href="#target">링크</a>
      <span data-testid="search-highlight" className="preview-search-overlay" />
    </div>
  );
}

function selectText(element: Element) {
  const text = element.firstChild;
  if (!(text instanceof Text)) throw new Error("선택할 텍스트가 없습니다.");
  const range = document.createRange();
  range.selectNodeContents(text);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return selection;
}

function primaryClick(element: Element, detail = 1) {
  fireEvent.pointerDown(element, {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.pointerUp(element, {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.click(element, { button: 0, detail });
}

afterEach(() => window.getSelection()?.removeAllRanges());

describe("preview selection dismissal", () => {
  it("clears a preview selection on a subsequent primary single click", () => {
    const { getByTestId, getByText } = render(<Harness />);
    const preview = getByTestId("preview");
    const selection = selectText(getByText("선택할 문장"));

    primaryClick(preview);

    expect(selection?.rangeCount).toBe(0);
    expect(getByTestId("search-highlight")).toBeInTheDocument();
  });

  it("keeps the selection made by a drag until the next simple click", () => {
    const { getByTestId, getByText } = render(<Harness />);
    const preview = getByTestId("preview");
    const selection = selectText(getByText("선택할 문장"));

    fireEvent.pointerDown(preview, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(preview, {
      isPrimary: true,
      pointerId: 1,
      clientX: 30,
      clientY: 10,
    });
    fireEvent.pointerUp(preview, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 30,
      clientY: 10,
    });
    fireEvent.click(preview, { button: 0, detail: 1 });

    expect(selection?.rangeCount).toBe(1);
    primaryClick(preview);
    expect(selection?.rangeCount).toBe(0);
  });

  it("does not clear selections for multiple, secondary, or interactive clicks", () => {
    const { getByTestId, getByText } = render(<Harness />);
    const preview = getByTestId("preview");
    const paragraph = getByText("선택할 문장");
    const link = getByText("링크");

    let selection = selectText(paragraph);
    primaryClick(preview, 2);
    expect(selection?.rangeCount).toBe(1);

    selection = selectText(paragraph);
    primaryClick(preview, 3);
    expect(selection?.rangeCount).toBe(1);

    fireEvent.pointerDown(preview, {
      button: 2,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerUp(preview, {
      button: 2,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.click(preview, { button: 2, detail: 1 });
    expect(selection?.rangeCount).toBe(1);

    fireEvent.pointerDown(preview, {
      button: 0,
      isPrimary: false,
      pointerId: 2,
    });
    fireEvent.pointerUp(preview, {
      button: 0,
      isPrimary: false,
      pointerId: 2,
    });
    fireEvent.click(preview, { button: 0, detail: 1 });
    expect(selection?.rangeCount).toBe(1);

    selection = selectText(paragraph);
    primaryClick(link);
    expect(selection?.rangeCount).toBe(1);
  });

  it("does not clear a selection outside the preview", () => {
    const outside = document.createElement("p");
    outside.textContent = "바깥 문장";
    document.body.append(outside);
    const { getByTestId } = render(<Harness />);
    const selection = selectText(outside);

    primaryClick(getByTestId("preview"));

    expect(selection?.rangeCount).toBe(1);
    outside.remove();
  });
});
