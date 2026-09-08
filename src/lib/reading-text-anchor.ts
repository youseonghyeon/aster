import { createReadingOffsetMapper } from "./reading-anchor-mapping";

export type ReadingTextAnchor = {
  text: string;
  offset: number;
  viewportTop: number;
};

function textNodes(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() && !node.parentElement?.closest(
        'button, svg, [aria-hidden="true"], .mermaid-diagram, .table-scroll, pre',
      ) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  // Container anchors can cover huge documents. Prefer the block fallback there.
  while (walker.nextNode()) {
    if (nodes.length === 256) return [];
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}

function characterRect(node: Text, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, Math.min(node.length, offset + 1));
  const rect = typeof range.getBoundingClientRect === "function"
    ? range.getBoundingClientRect() : null;
  range.detach();
  return rect && rect.height > 0 ? rect : null;
}

export function captureReadingTextAnchor(
  element: HTMLElement,
  containerTop: number,
  viewportOffset: number,
): ReadingTextAnchor | null {
  const nodes = textNodes(element);
  const focusY = containerTop + viewportOffset;
  let consumed = 0;
  let best: { offset: number; top: number; distance: number } | null = null;
  for (const node of nodes) {
    // Text is laid out in logical line order, including inline emphasis/links.
    let low = 0;
    let high = node.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const rect = characterRect(node, middle);
      if (!rect) break;
      if (rect.bottom <= focusY) low = middle + 1;
      else high = middle;
    }
    const rect = characterRect(node, low);
    if (rect) {
      const distance = Math.max(rect.top - focusY, focusY - rect.bottom, 0);
      if (!best || distance < best.distance) {
        best = { offset: consumed + low, top: rect.top - containerTop, distance };
      }
    }
    consumed += node.length;
  }
  return best ? {
    text: nodes.map(node => node.data).join(""),
    offset: best.offset,
    viewportTop: best.top,
  } : null;
}

export function getReadingTextAnchorTop(element: HTMLElement, anchor: ReadingTextAnchor) {
  const nodes = textNodes(element);
  const nextText = nodes.map(node => node.data).join("");
  const mappedOffset = createReadingOffsetMapper(anchor.text, nextText)(anchor.offset);
  if (mappedOffset === null) return null;
  let remaining = mappedOffset;
  for (const node of nodes) {
    if (remaining < node.length) return characterRect(node, remaining)?.top ?? null;
    remaining -= node.length;
  }
  return null;
}
