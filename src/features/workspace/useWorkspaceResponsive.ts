import { useEffect, useState } from "react";

export function useWorkspaceResponsive(
  setSidebarInset: (isInset: boolean) => void,
) {
  const [isWorkspaceStacked, setIsWorkspaceStacked] = useState(() =>
    window.matchMedia("(max-width: 720px)").matches,
  );

  useEffect(() => {
    const insetQuery = window.matchMedia("(min-width: 1280px)");
    const updateSidebarMode = () => setSidebarInset(insetQuery.matches);
    updateSidebarMode();
    insetQuery.addEventListener("change", updateSidebarMode);
    return () => insetQuery.removeEventListener("change", updateSidebarMode);
  }, [setSidebarInset]);

  useEffect(() => {
    const stackedQuery = window.matchMedia("(max-width: 720px)");
    const updateWorkspaceMode = () => setIsWorkspaceStacked(stackedQuery.matches);
    updateWorkspaceMode();
    stackedQuery.addEventListener("change", updateWorkspaceMode);
    return () => stackedQuery.removeEventListener("change", updateWorkspaceMode);
  }, []);

  return isWorkspaceStacked;
}
