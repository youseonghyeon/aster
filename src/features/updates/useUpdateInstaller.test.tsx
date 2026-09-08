import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateInstaller } from "./useUpdateInstaller";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true, Channel: class { onmessage = () => {}; } }));
beforeEach(() => { vi.mocked(invoke).mockReset(); localStorage.clear(); });
function backend(supported = true) {
  vi.mocked(invoke).mockImplementation(async command => command === "can_install_update" ? supported : undefined);
}
async function controller(prepare = vi.fn(async () => true)) {
  const hook = renderHook(() => useUpdateInstaller(prepare));
  await waitFor(() => expect(hook.result.current.supported).toBe(true));
  return hook;
}
describe("update installation", () => {
  it("requires successful preparation before installing downloaded version", async () => {
    backend(); const prepare = vi.fn(async () => false); const { result } = await controller(prepare);
    await act(() => result.current.download("1.9.0"));
    expect(result.current.phase).toBe("ready");
    await act(() => result.current.install());
    expect(invoke).not.toHaveBeenCalledWith("install_app_update", expect.anything());
    expect(result.current.phase).toBe("ready");
    prepare.mockResolvedValue(true);
    await act(() => result.current.install());
    expect(invoke).toHaveBeenCalledWith("install_app_update", { version: "1.9.0" });
  });
  it("coalesces repeated downloads and only becomes ready after native verification", async () => {
    let finish!: () => void;
    vi.mocked(invoke).mockImplementation(async command => command === "can_install_update" ? true : new Promise<void>(resolve => { finish = resolve; }));
    const { result } = await controller();
    let pending!: Promise<void>;
    act(() => { pending = result.current.download("1.9.0"); void result.current.download("1.9.0"); });
    expect(result.current.phase).toBe("downloading");
    expect(vi.mocked(invoke).mock.calls.filter(([c]) => c === "download_app_update")).toHaveLength(1);
    await act(async () => { finish(); await pending; });
    expect(result.current.phase).toBe("ready");
  });
  it("does not install after download/signature failure and permits a new download", async () => {
    backend(); const { result } = await controller();
    vi.mocked(invoke).mockRejectedValueOnce(new Error("invalid signature"));
    await act(() => result.current.download("1.9.0"));
    expect(result.current.phase).toBe("error");
    await act(() => result.current.install());
    expect(invoke).not.toHaveBeenCalledWith("install_app_update", expect.anything());
    await act(() => result.current.download("1.9.0"));
    expect(result.current.phase).toBe("ready");
  });
  it("retains downloaded version after installation failure for retry", async () => {
    backend(); const { result } = await controller();
    await act(() => result.current.download("1.9.0"));
    vi.mocked(invoke).mockRejectedValueOnce(new Error("permission denied"));
    await act(() => result.current.install());
    expect(result.current.phase).toBe("ready");
    expect(result.current.error).not.toBe("");
    await act(() => result.current.install());
    expect(vi.mocked(invoke).mock.calls.filter(([c]) => c === "install_app_update")).toHaveLength(2);
  });
  it("never invokes download or install in unsupported profiles", async () => {
    backend(false); const { result } = renderHook(() => useUpdateInstaller(async () => true));
    await act(async () => {});
    await act(() => result.current.download("1.9.0"));
    await act(() => result.current.install());
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
