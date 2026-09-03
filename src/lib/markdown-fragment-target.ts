import { createMarkdownHeadingAnchor } from "./markdown-heading-anchors";
import {
  markdownHtmlIdAttribute,
  markdownHtmlNameAttribute,
} from "./markdown-html";

export function findMarkdownFragmentTarget(
  container: ParentNode,
  fragment: string,
): HTMLElement | null {
  const explicitTarget = Array.from(
    container.querySelectorAll<HTMLElement>(
      `[${markdownHtmlIdAttribute}], [${markdownHtmlNameAttribute}]`,
    ),
  ).find(
    (candidate) =>
      candidate.getAttribute(markdownHtmlIdAttribute) === fragment ||
      candidate.getAttribute(markdownHtmlNameAttribute) === fragment,
  );

  if (explicitTarget) return explicitTarget;

  const headingAnchor = createMarkdownHeadingAnchor(fragment);
  if (!headingAnchor) return null;

  return (
    Array.from(
      container.querySelectorAll<HTMLElement>("[data-markdown-anchor]"),
    ).find(
      (candidate) => candidate.dataset.markdownAnchor === headingAnchor,
    ) ?? null
  );
}
