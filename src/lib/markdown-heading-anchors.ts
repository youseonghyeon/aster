type MarkdownHastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownHastNode[];
};

const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function nodeText(node: MarkdownHastNode): string {
  if (node.type === "text" || node.type === "raw") return node.value ?? "";
  if (node.tagName === "img") {
    return typeof node.properties?.alt === "string" ? node.properties.alt : "";
  }
  return node.children?.map(nodeText).join("") ?? "";
}

export function createMarkdownHeadingAnchor(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

export function rehypeMarkdownHeadingAnchors() {
  return function addMarkdownHeadingAnchors(tree: MarkdownHastNode) {
    const occurrences = new Map<string, number>();

    function visit(node: MarkdownHastNode) {
      if (node.type === "element" && node.tagName && headingTags.has(node.tagName)) {
        const base = createMarkdownHeadingAnchor(nodeText(node));
        if (base) {
          const count = occurrences.get(base) ?? 0;
          occurrences.set(base, count + 1);
          node.properties = {
            ...node.properties,
            "data-markdown-anchor": count === 0 ? base : `${base}-${count}`,
          };
        }
      }
      node.children?.forEach(visit);
    }

    visit(tree);
  };
}
