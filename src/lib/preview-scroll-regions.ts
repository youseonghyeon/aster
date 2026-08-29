const previewScrollRegionSelector = [
  ".markdown-body pre:not(.mermaid-diagram-source)",
  ".markdown-body .table-scroll",
  ".markdown-body .mermaid-diagram-scroll",
].join(", ");

export function getPreviewScrollRegions(container: ParentNode) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(previewScrollRegionSelector),
  );
}
