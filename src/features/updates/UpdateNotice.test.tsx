import { openUrl } from "@tauri-apps/plugin-opener";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateNotice } from "./UpdateNotice";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const update = {
  currentVersion: "1.7.0",
  latestVersion: "1.8.0",
  releaseUrl: "https://github.com/youseonghyeon/aster/releases/latest",
  updateAvailable: true,
};

describe("UpdateNotice", () => {
  it("offers installation only after download and prevents dismissal while busy", () => {
    const download = vi.fn(), install = vi.fn(), dismiss = vi.fn();
    const installer = { supported: true, phase: "idle" as const, progress: null, error: "", downloadedVersion: null, download, install };
    const { rerender } = render(<UpdateNotice update={update} isStacked={false} onDismiss={dismiss} installer={installer} />);
    fireEvent.click(screen.getByRole("button", { name: "업데이트 다운로드" }));
    expect(download).toHaveBeenCalledWith("1.8.0");
    rerender(<UpdateNotice update={update} isStacked={false} onDismiss={dismiss} installer={{ ...installer, phase: "downloading", progress: 45 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("45%");
    expect(screen.getByRole("button", { name: "업데이트 알림 닫기" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" });
    expect(dismiss).not.toHaveBeenCalled();
    rerender(<UpdateNotice update={update} isStacked={false} onDismiss={dismiss} installer={{ ...installer, phase: "ready" }} />);
    fireEvent.click(screen.getByRole("button", { name: "설치하고 재시작" }));
    expect(install).toHaveBeenCalledOnce();
  });

  it("shows both versions and opens the release page", () => {
    vi.mocked(openUrl).mockResolvedValue(undefined);
    render(<UpdateNotice update={update} isStacked={false} onDismiss={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("새 버전 1.8.0");
    expect(screen.getByRole("status")).toHaveTextContent("현재 1.7.0");
    fireEvent.click(screen.getByRole("button", { name: "업데이트 보기" }));
    expect(openUrl).toHaveBeenCalledWith(update.releaseUrl);
  });

  it("dismisses with the close button or Escape", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <UpdateNotice update={update} isStacked={true} onDismiss={onDismiss} />,
    );

    const notice = screen.getByRole("complementary", { name: "Aster 업데이트" });
    expect(notice).toHaveClass("is-stacked");
    fireEvent.keyDown(notice, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(
      <UpdateNotice update={update} isStacked={false} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "업데이트 알림 닫기" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("reports that the installed version is current without a release button", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <UpdateNotice
        update={{ ...update, latestVersion: "1.7.0", updateAvailable: false }}
        isStacked={false}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("최신 버전입니다");
    expect(
      screen.queryByRole("button", { name: "업데이트 보기" }),
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
