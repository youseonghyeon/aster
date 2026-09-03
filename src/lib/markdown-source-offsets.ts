type MarkdownHastNode = {
  type?: string;
  tagName?: string;
  position?: {
    start?: {
      offset?: number;
    };
  };
  properties?: Record<string, unknown>;
  children?: MarkdownHastNode[];
};

const scrollAnchorTags = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "blockquote",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "ul",
  "ol",
  "li",
  "pre",
  "table",
  "section",
  "hr",
]);

export function rehypeMarkdownSourceOffsets() {
  return function addSourceOffsets(tree: MarkdownHastNode) {
    function visit(node: MarkdownHastNode) {
      const sourceOffset = node.position?.start?.offset;

      if (
        node.type === "element" &&
        node.tagName &&
        scrollAnchorTags.has(node.tagName) &&
        typeof sourceOffset === "number"
      ) {
        node.properties = {
          ...node.properties,
          "data-source-offset": sourceOffset,
        };
      }

      node.children?.forEach(visit);
    }

    visit(tree);
  };
}
