import type { ReactNode } from "react";

type StageSidebarLayoutProps = {
  sidebar: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

export function StageSidebarLayout({
  sidebar,
  closeLabel,
  onClose,
  children,
}: StageSidebarLayoutProps) {
  return (
    <div className={`document-stage${sidebar ? " has-sidebar" : ""}`}>
      {sidebar}
      {sidebar ? (
        <button
          type="button"
          className="sidebar-scrim"
          tabIndex={-1}
          aria-label={closeLabel}
          onClick={onClose}
        />
      ) : null}
      {children}
    </div>
  );
}
