/** Serialize only the selected rendered content, never search the Markdown source. */
export function selectedMarkdown(root: HTMLElement, range: Range): string | null {
  if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const intersects = (node: Node) => range.intersectsNode(node);
  const text = (node: Text) => {
    if (!intersects(node)) return "";
    return node.data.slice(node === range.startContainer ? range.startOffset : 0,
      node === range.endContainer ? range.endOffset : node.length);
  };
  const selectedText = (node: Node): string => node.nodeType === Node.TEXT_NODE
    ? text(node as Text) : Array.from(node.childNodes).map(selectedText).join("");
  const escape = (value: string) => value.replace(/([\\`*_{}\[\]<>#|~])/g, "\\$1")
    .replace(/(^|\n)(\s*)([+\-]|\d+[.)])(?=\s)/g, (_, line, spaces, marker: string) =>
      `${line}${spaces}${/^\d/.test(marker) ? marker.slice(0, -1) + "\\" + marker.slice(-1) : "\\" + marker}`);
  const wrap = (marker: string, value: string) => value.trim()
    ? value.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, before, body, after) => `${before}${marker}${body}${marker}${after}`) : value;
  const visit = (node: Node): string => {
    if (!intersects(node)) return "";
    if (node.nodeType === Node.TEXT_NODE) return escape(text(node as Text));
    if (!(node instanceof Element)) return "";
    const tag = node.tagName.toLowerCase();
    // Diagram labels do not uniquely map to source. Do not silently copy their UI controls.
    if (tag === "svg" || node.classList.contains("mermaid-diagram")) throw new Error("diagram-selection");
    if (["button", "input", "script", "style"].includes(tag)) return "";
    if (tag === "br") return "  \n";
    if (tag === "hr") return "\n\n---\n\n";
    if (tag === "pre") {
      const body = selectedText(node);
      if (!body) return "";
      const fence = "`".repeat(Math.max(3, ...Array.from(body.matchAll(/`+/g), (m) => m[0].length + 1)));
      const language = node.closest("[data-copy-language]")?.getAttribute("data-copy-language") ?? node.querySelector("code")?.className.match(/language-([\w+-]+)/)?.[1] ?? "";
      return `\n\n${fence}${language}\n${body.replace(/\n$/, "")}\n${fence}\n\n`;
    }
    if (tag === "code") {
      const body = selectedText(node);
      if (!body) return "";
      const marker = "`".repeat(Math.max(1, ...Array.from(body.matchAll(/`+/g), (m) => m[0].length + 1)));
      const pad = /^`|`$|^ .* $/.test(body) ? " " : "";
      return `${marker}${pad}${body}${pad}${marker}`;
    }
    if (tag === "img") {
      // An image counts only when the range actually encloses the image node.
      const probe = document.createRange(); probe.selectNode(node);
      if (range.compareBoundaryPoints(Range.START_TO_START, probe) > 0 || range.compareBoundaryPoints(Range.END_TO_END, probe) < 0) return "";
      const src = node.getAttribute("data-copy-src") ?? node.getAttribute("src") ?? "";
      return src ? `![${escape(node.getAttribute("alt") ?? "")}](${destination(src)})` : "";
    }
    if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr"));
      const full = Array.from(node.querySelectorAll("th,td")).every((cell) => selectedText(cell) === cell.textContent);
      if (!full) return `\n\n${rows.map((row) => Array.from(row.children).map((cell) => selectedText(cell)).filter(Boolean).join("\t")).filter(Boolean).join("\n")}\n\n`;
      const lines = rows.map((row) => `| ${Array.from(row.children).map((cell) => Array.from(cell.childNodes).map(visit).join("").trim().replace(/(?<!\\)\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ")} |`);
      if (lines.length) lines.splice(1, 0, `| ${Array.from(rows[0].children).map((cell) => {
        const align = cell.getAttribute("align") ?? (cell as HTMLElement).style.textAlign;
        return align === "center" ? ":---:" : align === "right" ? "---:" : align === "left" ? ":---" : "---";
      }).join(" | ")} |`);
      return `\n\n${lines.join("\n")}\n\n`;
    }
    const body = Array.from(node.childNodes).map(visit).join("");
    if (!body.trim()) return body;
    if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${body.trim()}\n\n`;
    if (tag === "strong" || tag === "b") return wrap("**", body);
    if (tag === "em" || tag === "i") return wrap("*", body);
    if (tag === "del" || tag === "s") return wrap("~~", body);
    if (tag === "a") {
      const href = node.getAttribute("href");
      return href ? `[${body}](${destination(href)})` : body;
    }
    if (tag === "blockquote") return `\n\n${body.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    if (tag === "li") {
      const parent = node.parentElement;
      const number = Number(parent?.getAttribute("start") ?? 1) + Array.from(parent?.children ?? []).indexOf(node);
      const marker = parent?.tagName === "OL" ? `${number}. ` : "- ";
      const checkbox = node.querySelector(":scope > input[type=checkbox], :scope > p > input[type=checkbox]") as HTMLInputElement | null;
      const task = checkbox ? `[${checkbox.checked ? "x" : " "}] ` : "";
      return `${marker}${task}${body.trim().replace(/\n/g, `\n${" ".repeat(marker.length)}`)}\n`;
    }
    if (tag === "ul" || tag === "ol") return `\n\n${body.trimEnd()}\n\n`;
    if (tag === "p" || tag === "div") return `\n\n${body.trim()}\n\n`;
    return body;
  };
  try {
    const result = Array.from(root.childNodes).map(visit).join("").trim();
    return result || null;
  } catch { return null; }
}

function destination(value: string) {
  return `<${value.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\n/g, "%0A")}>`;
}

export async function writeMarkdownClipboard(value: string) {
  // execCommand retains user activation for native context-menu actions in WebViews.
  let copied = false;
  const listener = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", value);
    copied = true;
  };
  document.addEventListener("copy", listener);
  try { document.execCommand?.("copy"); } finally { document.removeEventListener("copy", listener); }
  if (!copied) await navigator.clipboard.writeText(value);
}
