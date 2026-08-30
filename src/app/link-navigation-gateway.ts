import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export function resolveRelativeMarkdownPath(
  documentPath: string,
  relativePath: string,
) {
  return invoke<string>("resolve_relative_markdown_path", {
    documentPath,
    relativePath,
  });
}

export function readRelativeImage(documentPath: string, relativePath: string) {
  return invoke<string>("read_relative_image", {
    documentPath,
    relativePath,
  });
}

export function openExternalLink(url: string) {
  return openUrl(url);
}
