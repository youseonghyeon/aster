import { defaultSchema } from "rehype-sanitize";

type MarkdownHastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownHastNode[];
};

export const markdownHtmlClobberPrefix = "aster-user-content-";
export const markdownHtmlIdAttribute = "data-markdown-html-id";
export const markdownHtmlNameAttribute = "data-markdown-html-name";

const strippedHtmlTags = [
  ...(defaultSchema.strip ?? []),
  "embed",
  "iframe",
  "math",
  "object",
  "plaintext",
  "style",
  "svg",
  "template",
  "textarea",
  "title",
];

const globalAttributes = (defaultSchema.attributes?.["*"] ?? []).filter(
  (attribute) => {
    const name = Array.isArray(attribute) ? attribute[0] : attribute;
    return name !== "accessKey" && name !== "tabIndex";
  },
);

export const markdownHtmlSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": globalAttributes,
  },
  clobberPrefix: markdownHtmlClobberPrefix,
  strip: Array.from(new Set(strippedHtmlTags)),
};

function authoredAnchorValue(value: unknown) {
  if (typeof value !== "string") return null;
  return value.startsWith(markdownHtmlClobberPrefix)
    ? value.slice(markdownHtmlClobberPrefix.length)
    : null;
}

function isNaturallyFocusable(node: MarkdownHastNode) {
  return (
    (node.tagName === "a" && typeof node.properties?.href === "string") ||
    node.tagName === "input" ||
    node.tagName === "summary"
  );
}

export function rehypeMarkdownExplicitAnchors() {
  return function addMarkdownExplicitAnchors(tree: MarkdownHastNode) {
    function visit(node: MarkdownHastNode) {
      if (node.type === "element") {
        const id = authoredAnchorValue(node.properties?.id);
        const name = authoredAnchorValue(node.properties?.name);

        if (id || name) {
          node.properties = {
            ...node.properties,
            ...(id ? { [markdownHtmlIdAttribute]: id } : {}),
            ...(name ? { [markdownHtmlNameAttribute]: name } : {}),
            ...(!isNaturallyFocusable(node) ? { tabIndex: -1 } : {}),
          };
        }
      }

      node.children?.forEach(visit);
    }

    visit(tree);
  };
}
