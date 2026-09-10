import type { FolderEntry, FolderRoot } from "./folder-gateway";

export function relativeCurrentFile(rootPath: string, path: string | null) {
  const prefix = rootPath.replace(/\/+$/, "") + "/";
  if (!path?.startsWith(prefix)) return null;
  const relative = path.slice(prefix.length);
  return relative && relative.split("/").every(part => part && part !== "." && part !== "..")
    ? relative
    : null;
}

/** Resolve through validated listings; never switch roots or open a document. */
export async function findCurrentFile(
  root: FolderRoot,
  path: string,
  read: (directory: string) => Promise<{ entries: FolderEntry[]; truncated: boolean }>,
  valid: () => boolean,
) {
  const relative = relativeCurrentFile(root.path, path);
  if (!relative) throw new Error("현재 문서가 열린 폴더 안에 없습니다.");
  const parts = relative.split("/");
  const ancestors: string[] = [];
  let directory = "";
  for (let i = 0; i < parts.length; i++) {
    if (!valid()) return null;
    const listing = await read(directory);
    if (!valid()) return null;
    const candidate = directory ? `${directory}/${parts[i]}` : parts[i];
    const entry = listing.entries.find(e => e.relativePath === candidate);
    if (!entry) {
      throw new Error(listing.truncated
        ? "목록 표시 한도로 현재 파일을 찾지 못했습니다."
        : "현재 파일을 목록에서 찾지 못했습니다. 파일 위치를 확인해 주세요.");
    }
    if (i === parts.length - 1) {
      if (entry.kind !== "markdown" || entry.path !== path) {
        throw new Error("현재 문서와 목록의 파일이 일치하지 않습니다.");
      }
      return { path: relative, ancestors };
    }
    if (entry.kind !== "directory") throw new Error("파일의 상위 폴더를 찾지 못했습니다.");
    directory = candidate;
    ancestors.push(directory);
  }
  return null;
}
