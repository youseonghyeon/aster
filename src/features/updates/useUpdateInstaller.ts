import { clearUpdateReadingResume } from "../../lib/update-reading-resume";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useBlockingModal } from "../../shared/blocking-modal";

export type InstallPhase = "idle" | "downloading" | "ready" | "installing" | "error";
export function useUpdateInstaller(beforeRestart: () => Promise<boolean>) {
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const readyVersion = useRef<string | null>(null);
  const mounted = useRef(false);
  const modal = useBlockingModal();
  useEffect(() => {
    mounted.current = true;
    if (!isTauri()) return () => { mounted.current = false; };
    void (async () => {
      try {
        const value = await invoke<boolean>("can_install_update");
        if (mounted.current) setSupported(value === true);
      } catch { /* Browsers and unsupported runtimes keep manual updates. */ }
    })();
    return () => { mounted.current = false; };
  }, []);

  async function download(version: string) {
    if (!supported || busy.current) return;
    busy.current = true;
    readyVersion.current = null;
    setError(""); setProgress(null); setPhase("downloading");
    try {
      const onProgress = new Channel<{ downloaded: number; total?: number }>();
      onProgress.onmessage = ({ downloaded, total }) => {
        if (mounted.current) setProgress(total && total > 0 ? Math.min(100, Math.floor(downloaded / total * 100)) : null);
      };
      await invoke("download_app_update", { version, onProgress });
      readyVersion.current = version;
      if (mounted.current) setPhase("ready");
    } catch {
      if (mounted.current) { setError("다운로드하지 못했습니다. 네트워크와 업데이트 파일을 확인한 뒤 다시 시도해 주세요."); setPhase("error"); }
    } finally { busy.current = false; }
  }

  async function install() {
    if (!supported || busy.current || !readyVersion.current) return;
    busy.current = true;
    const unregister = modal.register();
    setError(""); setPhase("installing");
    try {
      if (!(await beforeRestart())) {
        setError("작업을 저장하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요."); setPhase("ready"); return;
      }
      await invoke("install_app_update", { version: readyVersion.current });
    } catch {
      clearUpdateReadingResume();
      if (mounted.current) {
        setError("저장 또는 설치를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setPhase("ready");
      }
    } finally { busy.current = false; unregister(); }
  }
  return { supported, phase, progress, error, downloadedVersion: readyVersion.current, download, install };
}
