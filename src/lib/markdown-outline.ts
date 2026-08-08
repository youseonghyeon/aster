import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type MarkdownOutlineItem = {
  id: string;
  depth: number;
  title: string;
};

type MarkdownAstNode = {
  type: string;
  depth?: number;
  children?: MarkdownAstNode[];
  position?: {
    start?: {
      offset?: number;
    };
  };
};

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const headingIdPrefix = "aster-heading-";

export function getMarkdownHeadingId(offset: number | undefined) {
  return typeof offset === "number" ? `${headingIdPrefix}${offset}` : undefined;
}

export function getMarkdownOutline(markdown: string): MarkdownOutlineItem[] {
  const outline: MarkdownOutlineItem[] = [];
  const tree = markdownParser.parse(markdown) as MarkdownAstNode;

  function visit(node: MarkdownAstNode) {
    if (node.type === "heading" && typeof node.depth === "number") {
      const id = getMarkdownHeadingId(node.position?.start?.offset);
      const title = toString(node as Parameters<typeof toString>[0]).trim();

      if (id && title) {
        outline.push({ id, depth: node.depth, title });
      }
    }

    node.children?.forEach(visit);
  }

  visit(tree);
  return outline;
}
