import type { SearchArea } from "../../lib/text-search";

export type PaneKind = "editor" | "preview";
export type PaneContent = PaneKind | "notes";
export type SourceArea = Exclude<SearchArea, "preview">;
export type WorkspaceContentElements = Record<
  SearchArea,
  HTMLTextAreaElement | HTMLDivElement | null
>;
