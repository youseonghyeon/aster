import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidDiagram, readMermaidThemeTokens } from "./MermaidDiagram";

const { renderMermaidDiagram } = vi.hoisted(() => ({
  renderMermaidDiagram: vi.fn(),
}));

vi.mock("../lib/mermaid-renderer", () => ({
  renderMermaidDiagram,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setScrollableDiagramMetrics(
  region: HTMLElement,
  canvasPadding = 40,
) {
  Object.defineProperties(region, {
    clientWidth: { configurable: true, value: 300 },
    clientHeight: { configurable: true, value: 200 },
    scrollWidth: {
      configurable: true,
      get: () =>
        Number.parseFloat(region.querySelector("svg")?.style.width || "0") +
        canvasPadding,
    },
    scrollHeight: {
      configurable: true,
      get: () =>
        Number.parseFloat(region.querySelector("svg")?.style.height || "0") +
        canvasPadding,
    },
  });
}

describe("MermaidDiagram", () => {
  beforeEach(() => {
    renderMermaidDiagram.mockReset();
  });

  it("reads the current Aster theme tokens", () => {
    const shell = document.createElement("div");
    shell.className = "app-shell";
    shell.style.setProperty("--preview-background", "#101010");
    shell.style.setProperty("--text-body", "#eeeeee");
    shell.style.setProperty("--accent", "#abcdef");
    shell.style.setProperty("--reading-font", "Aster Test");
    shell.style.setProperty("--reading-font-size", "19px");
    shell.style.colorScheme = "dark";
    const child = document.createElement("div");
    shell.append(child);
    document.body.append(shell);

    expect(readMermaidThemeTokens(child)).toMatchObject({
      background: "#101010",
      text: "#eeeeee",
      accent: "#abcdef",
      fontFamily: "Aster Test",
      fontSize: "19px",
      darkMode: true,
    });
    shell.remove();
  });

  it("shows an accessible SVG with per-diagram zoom controls", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 920.2 410.1"><title>읽기 흐름</title><text>완료</text></svg>',
    );
    render(
      <MermaidDiagram
        source="flowchart LR\nA --> B"
        sourceOffset={12}
        appearanceKey="paper"
        curve="curved"
      />,
    );

    const region = screen.getByRole("region", { name: "Mermaid 다이어그램" });
    expect(region).toHaveAttribute("aria-busy", "true");
    await screen.findByText("완료");

    const svg = region.querySelector("svg");
    expect(region).toHaveAttribute("aria-busy", "false");
    expect(region).toHaveAttribute(
      "aria-label",
      "Mermaid 다이어그램: 읽기 흐름",
    );
    expect(region).not.toHaveAttribute("data-source-offset");
    expect(region.parentElement).toHaveAttribute("data-source-offset", "12");
    expect(svg).toHaveStyle({ width: "921px", height: "411px" });
    expect(svg).toHaveAttribute("focusable", "false");

    const controls = screen.getByRole("group", {
      name: "다이어그램 확대 및 축소",
    });
    expect(controls).toHaveAttribute("data-preview-search-ignore", "true");
    expect(controls).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("button", { name: "다이어그램 축소" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "100% — 100%로 재설정" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "다이어그램 확대" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "현재 폭에 한 번 맞춤" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Mermaid 다이어그램: 읽기 흐름 크게 보기",
      }),
    ).toHaveClass("mermaid-diagram-canvas", "is-openable");
    expect(screen.queryByText("크게 보기")).not.toBeInTheDocument();
  });

  it("opens a modal large view without changing the inline zoom state", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 1000 400"><title>큰 읽기 흐름</title><text>확대 대상</text></svg>',
    );
    render(
      <MermaidDiagram
        source="flowchart LR\nA --> B"
        appearanceKey="paper"
        curve="curved"
      />,
    );
    await screen.findByText("확대 대상");

    const inlineRegion = screen.getByRole("region", {
      name: "Mermaid 다이어그램: 큰 읽기 흐름",
    });
    fireEvent.click(screen.getByRole("button", { name: "다이어그램 확대" }));
    const inlineSvg = inlineRegion.querySelector<SVGSVGElement>("svg");
    const inlineSizeBeforeOpen = {
      width: inlineSvg?.style.width,
      height: inlineSvg?.style.height,
    };
    expect(inlineSizeBeforeOpen).toEqual({
      width: "1100px",
      height: "440px",
    });
    const openCanvas = screen.getByRole("button", {
      name: "Mermaid 다이어그램: 큰 읽기 흐름 크게 보기",
    });
    fireEvent.keyDown(openCanvas, { key: "Enter" });

    const dialog = screen.getByRole("dialog", { name: "큰 읽기 흐름" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-preview-search-ignore", "true");
    const largeRegion = within(dialog).getByRole("region", {
      name: "큰 보기: 큰 읽기 흐름",
    });
    expect(largeRegion.querySelector("svg")).toHaveStyle({
      width: "1000px",
      height: "400px",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "다이어그램 확대" }),
    );
    expect(largeRegion.querySelector("svg")).toHaveStyle({
      width: "1100px",
      height: "440px",
    });
    const inlineSvgAfterDialogUpdate =
      inlineRegion.querySelector<SVGSVGElement>("svg");
    expect(inlineSvgAfterDialogUpdate?.style.width).toBe(
      inlineSizeBeforeOpen.width,
    );
    expect(inlineSvgAfterDialogUpdate?.style.height).toBe(
      inlineSizeBeforeOpen.height,
    );

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(openCanvas).toHaveFocus());
  });

  it("opens from the canvas, blocks key propagation, and closes from the backdrop", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 600 300"><text>캔버스 열기</text></svg>',
    );
    render(
      <MermaidDiagram source="flowchart LR" appearanceKey="paper" curve="curved" />,
    );
    await screen.findByText("캔버스 열기");

    const inlineCanvas = document.querySelector<HTMLElement>(
      ".mermaid-diagram-canvas",
    );
    expect(inlineCanvas).toHaveClass("is-openable");
    fireEvent.click(inlineCanvas as HTMLElement);

    const dialog = screen.getByRole("dialog");
    const windowKeyDown = vi.fn();
    window.addEventListener("keydown", windowKeyDown);
    fireEvent.keyDown(dialog, { key: "f", metaKey: true });
    expect(windowKeyDown).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowKeyDown);

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pans an overflowing large view with a primary pointer drag", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 1000 600" width="100%" style="max-width: 1000px"><text>드래그 이동</text></svg>',
    );
    render(
      <MermaidDiagram source="flowchart LR" appearanceKey="paper" curve="curved" />,
    );
    await screen.findByText("드래그 이동");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mermaid 다이어그램 크게 보기",
      }),
    );
    const dialog = screen.getByRole("dialog");
    const largeRegion = within(dialog).getByRole<HTMLElement>("region", {
      name: "큰 보기: Mermaid 다이어그램",
    });
    const largeCanvas = largeRegion.querySelector<HTMLElement>(
      ".mermaid-diagram-dialog-canvas",
    );
    expect(largeCanvas).not.toBeNull();
    Object.defineProperties(largeRegion, {
      clientWidth: { configurable: true, value: 300 },
      clientHeight: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollHeight: { configurable: true, value: 600 },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "다이어그램 확대" }),
    );
    expect(largeRegion.querySelector("svg")).toHaveStyle({
      width: "1100px",
      height: "660px",
    });
    largeRegion.scrollLeft = 120;
    largeRegion.scrollTop = 80;
    const svgBeforePointerDown = largeRegion.querySelector("svg");

    fireEvent.pointerDown(largeCanvas as HTMLElement, {
      pointerId: 7,
      button: 0,
      isPrimary: true,
      clientX: 220,
      clientY: 160,
    });
    expect(largeCanvas).toHaveClass("is-dragging");
    expect(largeRegion.querySelector("svg")).toBe(svgBeforePointerDown);
    expect(largeRegion.querySelector("svg")).toHaveStyle({
      width: "1100px",
      height: "660px",
    });
    expect(largeRegion.scrollLeft).toBe(120);
    expect(largeRegion.scrollTop).toBe(80);
    expect(
      within(dialog).getByRole("button", {
        name: "110% — 100%로 재설정",
      }),
    ).toBeEnabled();

    fireEvent.pointerMove(largeCanvas as HTMLElement, {
      pointerId: 7,
      buttons: 1,
      isPrimary: true,
      clientX: 150,
      clientY: 100,
    });
    expect(largeRegion.scrollLeft).toBe(190);
    expect(largeRegion.scrollTop).toBe(140);
    const svgBeforePointerUp = largeRegion.querySelector("svg");

    fireEvent.pointerUp(largeCanvas as HTMLElement, {
      pointerId: 7,
      button: 0,
      isPrimary: true,
      clientX: 150,
      clientY: 100,
    });
    expect(largeCanvas).not.toHaveClass("is-dragging");
    expect(largeRegion.querySelector("svg")).toBe(svgBeforePointerUp);
    expect(largeRegion.scrollLeft).toBe(190);
    expect(largeRegion.scrollTop).toBe(140);
  });

  it("zooms the large view with Command and wheel without consuming a plain wheel", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 1000 600"><text>휠 확대</text></svg>',
    );
    render(
      <MermaidDiagram source="flowchart LR" appearanceKey="paper" curve="curved" />,
    );
    await screen.findByText("휠 확대");

    fireEvent.click(
      screen.getByRole("button", { name: "Mermaid 다이어그램 크게 보기" }),
    );
    const dialog = screen.getByRole("dialog");
    const largeRegion = within(dialog).getByRole<HTMLElement>("region");

    const zoomInWheel = createEvent.wheel(largeRegion, {
      bubbles: true,
      cancelable: true,
      deltaY: -80,
      metaKey: true,
    });
    fireEvent(largeRegion, zoomInWheel);
    expect(zoomInWheel.defaultPrevented).toBe(true);
    expect(
      within(dialog).getByRole("button", {
        name: "110% — 100%로 재설정",
      }),
    ).toBeEnabled();
    expect(largeRegion.querySelector("svg")).toHaveStyle({
      width: "1100px",
      height: "660px",
    });

    const plainWheel = createEvent.wheel(largeRegion, {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
    });
    fireEvent(largeRegion, plainWheel);
    expect(plainWheel.defaultPrevented).toBe(false);
    expect(
      within(dialog).getByRole("button", {
        name: "110% — 100%로 재설정",
      }),
    ).toBeEnabled();

    const zoomOutWheel = createEvent.wheel(largeRegion, {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
      metaKey: true,
    });
    fireEvent(largeRegion, zoomOutWheel);
    expect(zoomOutWheel.defaultPrevented).toBe(true);
    expect(
      within(dialog).getByRole("button", {
        name: "100% — 100%로 재설정",
      }),
    ).toBeDisabled();
  });

  it("zooms, resets, and fits an individual diagram", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 1000 400"><text>배율 테스트</text></svg>',
    );
    render(
      <MermaidDiagram
        source="flowchart LR"
        appearanceKey="paper"
        curve="curved"
      />,
    );
    await screen.findByText("배율 테스트");

    const region = screen.getByRole<HTMLElement>("region", {
      name: "Mermaid 다이어그램",
    });
    const canvas = region.querySelector<HTMLElement>(".mermaid-diagram-canvas");
    expect(canvas).not.toBeNull();
    Object.defineProperty(region, "clientWidth", {
      configurable: true,
      value: 520,
    });
    canvas?.style.setProperty("padding-left", "20px");
    canvas?.style.setProperty("padding-right", "20px");

    fireEvent.click(screen.getByRole("button", { name: "다이어그램 확대" }));
    expect(region.querySelector("svg")).toHaveStyle({
      width: "1100px",
      height: "440px",
    });
    expect(
      screen.getByRole("button", { name: "110% — 100%로 재설정" }),
    ).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "110% — 100%로 재설정" }),
    );
    expect(region.querySelector("svg")).toHaveStyle({
      width: "1000px",
      height: "400px",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "현재 폭에 한 번 맞춤" }),
    );
    expect(region.querySelector("svg")).toHaveStyle({
      width: "480px",
      height: "192px",
    });
    expect(
      screen.getByRole("button", { name: "48% — 100%로 재설정" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "현재 폭에 한 번 맞춤" }),
    );
    expect(region.querySelector("svg")).toHaveStyle({
      width: "480px",
      height: "192px",
    });
  });

  it("keeps zoom state independent between diagrams", async () => {
    renderMermaidDiagram.mockImplementation(
      ({ source: currentSource }: { source: string }) =>
        Promise.resolve(
          currentSource === "A"
            ? '<svg viewBox="0 0 500 300"><title>첫 번째</title><text>첫 SVG</text></svg>'
            : '<svg viewBox="0 0 600 300"><title>두 번째</title><text>둘째 SVG</text></svg>',
        ),
    );
    const { rerender } = render(
      <MermaidDiagram source="A" appearanceKey="paper" curve="curved" />,
    );
    await screen.findByText("첫 SVG");
    rerender(
      <>
        <MermaidDiagram source="A" appearanceKey="paper" curve="curved" />
        <MermaidDiagram source="B" appearanceKey="paper" curve="curved" />
      </>,
    );
    await screen.findByText("둘째 SVG");
    const firstRegion = screen.getByRole("region", {
      name: "Mermaid 다이어그램: 첫 번째",
    });
    const secondRegion = screen.getByRole("region", {
      name: "Mermaid 다이어그램: 두 번째",
    });

    fireEvent.click(
      within(firstRegion.parentElement as HTMLElement).getByRole("button", {
        name: "다이어그램 확대",
      }),
    );

    expect(firstRegion.querySelector("svg")).toHaveStyle({ width: "550px" });
    expect(secondRegion.querySelector("svg")).toHaveStyle({ width: "600px" });
    expect(
      within(secondRegion.parentElement as HTMLElement).getByRole("button", {
        name: "100% — 100%로 재설정",
      }),
    ).toBeDisabled();
  });

  it("preserves the visible center when zoom changes", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 900 400"><text>중심</text></svg>',
    );
    render(
      <MermaidDiagram
        source="flowchart LR"
        appearanceKey="paper"
        curve="curved"
      />,
    );
    await screen.findByText("중심");
    const region = screen.getByRole<HTMLElement>("region", {
      name: "Mermaid 다이어그램",
    });
    setScrollableDiagramMetrics(region);
    region.scrollLeft = 320;
    region.scrollTop = 120;

    fireEvent.click(screen.getByRole("button", { name: "다이어그램 확대" }));

    expect(region.scrollLeft).toBe(365);
    expect(region.scrollTop).toBe(140);
  });

  it("keeps zoom and the visible center while appearance rerenders", async () => {
    const second = deferred<string>();
    renderMermaidDiagram
      .mockResolvedValueOnce('<svg viewBox="0 0 900 400"><text>이전</text></svg>')
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(
      <MermaidDiagram
        source="flowchart LR\nA --> B"
        appearanceKey="paper"
        curve="curved"
      />,
    );
    await screen.findByText("이전");
    const region = screen.getByRole<HTMLElement>("region", {
      name: "Mermaid 다이어그램",
    });
    setScrollableDiagramMetrics(region);
    fireEvent.click(screen.getByRole("button", { name: "다이어그램 확대" }));
    region.scrollTop = 140;
    region.scrollLeft = 365;

    rerender(
      <MermaidDiagram
        source="flowchart LR\nA --> B"
        appearanceKey="night"
        curve="curved"
      />,
    );
    await waitFor(() => expect(region).toHaveAttribute("aria-busy", "true"));
    expect(
      screen.getByRole("region", { name: "Mermaid 다이어그램" }),
    ).toBe(region);
    expect(screen.getByText("이전")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "다이어그램 확대 및 축소" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "다이어그램 확대" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "110% — 100%로 재설정" }),
    ).toBeDisabled();

    await act(async () => {
      second.resolve('<svg viewBox="0 0 1000 500"><text>새 테마</text></svg>');
      await second.promise;
    });
    await screen.findByText("새 테마");
    expect(
      screen.getByRole("region", { name: "Mermaid 다이어그램" }),
    ).toBe(region);
    expect(region.querySelector("svg")).toHaveStyle({
      width: "1100px",
      height: "550px",
    });
    expect(region.scrollTop).toBeCloseTo(195, 5);
    expect(region.scrollLeft).toBeCloseTo(420, 5);
    expect(screen.getByRole("button", { name: "다이어그램 확대" })).toBeEnabled();
  });

  it("keeps nested and preview positions while the curve rerenders", async () => {
    const second = deferred<string>();
    renderMermaidDiagram
      .mockResolvedValueOnce(
        '<svg viewBox="0 0 900 400"><text>곡선 다이어그램</text></svg>',
      )
      .mockReturnValueOnce(second.promise);
    const view = (curve: "curved" | "orthogonal") => (
      <div className="preview-scroll" data-testid="preview-scroll">
        <MermaidDiagram
          source="flowchart LR\nA --> B"
          sourceOffset={12}
          appearanceKey="paper"
          curve={curve}
        />
        <p data-source-offset="200">뒤쪽 기준점</p>
      </div>
    );
    const { rerender } = render(view("curved"));
    await screen.findByText("곡선 다이어그램");

    const preview = screen.getByTestId("preview-scroll");
    const anchor = screen.getByText("뒤쪽 기준점");
    const diagram = screen.getByRole("region", {
      name: "Mermaid 다이어그램",
    }).parentElement as HTMLElement;
    const region = screen.getByRole<HTMLElement>("region", {
      name: "Mermaid 다이어그램",
    });
    Object.defineProperty(preview, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0 }),
    });
    Object.defineProperty(diagram, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: -500 }),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top:
          (screen.queryByText("직각 다이어그램") ? 140 : 80) -
          preview.scrollTop,
      }),
    });
    setScrollableDiagramMetrics(region);
    fireEvent.click(screen.getByRole("button", { name: "다이어그램 확대" }));
    region.scrollTop = 140;
    region.scrollLeft = 365;
    preview.scrollTop = 100;

    rerender(view("orthogonal"));
    await waitFor(() => expect(region).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByText("곡선 다이어그램")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다이어그램 확대" })).toBeDisabled();
    expect(renderMermaidDiagram).toHaveBeenLastCalledWith(
      expect.objectContaining({ curve: "orthogonal" }),
    );

    await act(async () => {
      second.resolve(
        '<svg viewBox="0 0 1000 500"><text>직각 다이어그램</text></svg>',
      );
      await second.promise;
    });
    await screen.findByText("직각 다이어그램");

    expect(region.querySelector("svg")).toHaveStyle({
      width: "1100px",
      height: "550px",
    });
    expect(region.scrollTop).toBeCloseTo(195, 5);
    expect(region.scrollLeft).toBeCloseTo(420, 5);
    expect(preview.scrollTop).toBe(160);
  });

  it("discards a stale result after the source changes", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    renderMermaidDiagram
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(
      <MermaidDiagram source="old" appearanceKey="paper" curve="curved" />,
    );
    expect(
      screen.queryByRole("group", { name: "다이어그램 확대 및 축소" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(renderMermaidDiagram).toHaveBeenCalledTimes(1));
    rerender(
      <MermaidDiagram source="new" appearanceKey="paper" curve="curved" />,
    );
    await waitFor(() => expect(renderMermaidDiagram).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve('<svg viewBox="0 0 100 80"><text>최신</text></svg>');
      await second.promise;
    });
    await screen.findByText("최신");
    await act(async () => {
      first.resolve('<svg viewBox="0 0 100 80"><text>이전 결과</text></svg>');
      await first.promise;
    });
    expect(screen.queryByText("이전 결과")).not.toBeInTheDocument();
    expect(screen.getByText("최신")).toBeInTheDocument();
  });

  it("shows the original source with actionable guidance after an error", async () => {
    renderMermaidDiagram.mockRejectedValueOnce(new Error("parse failed"));
    render(
      <MermaidDiagram
        source="not a diagram"
        appearanceKey="paper"
        curve="curved"
      />,
    );

    expect(
      await screen.findByText(
        "다이어그램을 표시하지 못했습니다. 아래 Mermaid 문법을 확인하세요.",
      ),
    ).toHaveAttribute("role", "status");
    expect(
      screen.getByText(
        "다이어그램을 표시하지 못했습니다. 아래 Mermaid 문법을 확인하세요.",
      ),
    ).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByRole("region", { name: "Mermaid 다이어그램" })).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(screen.getByText("not a diagram")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "다이어그램 확대 및 축소" }),
    ).not.toBeInTheDocument();
  });
});
