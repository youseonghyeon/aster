import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useScrollSync } from "./useScrollSync";

afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

it.each([true, false])("cancels queued sync when reading restoration owns the viewport (enabled=%s)", async enabled => {
  vi.useFakeTimers();
  const editor = document.createElement("textarea");
  const preview = document.createElement("div");
  preview.innerHTML = '<article class="markdown-body"></article>';
  document.body.append(editor, preview);
  Object.defineProperties(editor, {clientHeight:{value:200},scrollHeight:{value:1200}});
  Object.defineProperties(preview, {clientHeight:{value:200},scrollHeight:{value:2200}});
  const scrollTo = vi.fn(); preview.scrollTo = scrollTo;
  editor.scrollTo = vi.fn();
  const {result, unmount} = renderHook(() => useScrollSync({enabled, active:true,
    markdown:"long document", editorElement:editor, previewElement:preview}));
  await act(async () => vi.advanceTimersByTimeAsync(200));
  act(() => {editor.scrollTop = 500; editor.dispatchEvent(new Event("scroll"));});
  act(() => result.current.suppressScrollSyncRestore());
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(scrollTo).not.toHaveBeenCalled();
  if (enabled) {
    // Subsequent genuine input still synchronizes; suppression doesn't disable the feature.
    act(() => {
      editor.dispatchEvent(new WheelEvent("wheel"));
      editor.scrollTop = 600;
      editor.dispatchEvent(new Event("scroll"));
    });
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(scrollTo).toHaveBeenLastCalledWith({top:1200,behavior:"auto"});
  }
  unmount(); editor.remove(); preview.remove();
});
