import { capturePreviewReadingAnchor, type PreviewReadingAnchorSnapshot } from "./preview-scroll-anchor";

const key = "aster:update-reading-resume:v1";
function fingerprint(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}

export function saveUpdateReadingResume(container: HTMLElement | null, path: string | null, markdown: string) {
  if (!container) return;
  const { container: _container, ...anchor } = capturePreviewReadingAnchor(container);
  void _container;
  // A storage failure must stop the caller before installation begins.
  localStorage.setItem(key, JSON.stringify({ version: 1, path, content: fingerprint(markdown), anchor, savedAt: Date.now() }));
}

export function takeUpdateReadingResume(container: HTMLElement, path: string | null, markdown: string): PreviewReadingAnchorSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    localStorage.removeItem(key);
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || saved.path !== path || saved.content !== fingerprint(markdown) ||
      !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > 86_400_000 || saved.savedAt > Date.now()) return null;
    const a = saved.anchor;
    if (!a || ![a.blockProgress, a.viewportOffset, a.scrollProgress, a.scrollTop].every(Number.isFinite) ||
      !(a.sourceOffset === null || typeof a.sourceOffset === "string")) return null;
    if (a.textAnchor && (typeof a.textAnchor.text !== "string" || !Number.isInteger(a.textAnchor.offset) || !Number.isFinite(a.textAnchor.viewportTop))) return null;
    return { container, sourceOffset: a.sourceOffset, blockProgress: a.blockProgress,
      viewportOffset: a.viewportOffset, scrollProgress: a.scrollProgress, scrollTop: a.scrollTop,
      textAnchor: a.textAnchor ?? null };
  } catch { return null; }
}

export function clearUpdateReadingResume() {
  try { localStorage.removeItem(key); } catch { /* Installation already stopped. */ }
}
