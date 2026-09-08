import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

export function createManifest(version, macFile, windowsFile, readSignature, notes = "") {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("A stable release version is required");
  if (!["Aster.app.tar.gz", `Aster_${version}_universal.app.tar.gz`].includes(macFile) || windowsFile !== `Aster_${version}_x64-setup.exe`) throw new Error("Unexpected updater artifact names");
  function platform(file) {
    if (basename(file) !== file || /[?#]/.test(file)) throw new Error("Use an artifact filename, not a path");
    const signature = readSignature(file).trim();
    if (!signature || !Buffer.from(signature, "base64").toString().startsWith("untrusted comment:")) throw new Error(`Missing or invalid signature: ${file}`);
    return { signature, url: `https://github.com/youseonghyeon/aster/releases/download/v${version}/${encodeURIComponent(file)}` };
  }
  const mac = platform(macFile);
  return { version, notes, platforms: { "darwin-aarch64": mac, "darwin-x86_64": mac, "windows-x86_64": platform(windowsFile) } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, directory, macFile, windowsFile, notesFile] = process.argv.slice(2);
  if (!directory || !macFile || !windowsFile) throw new Error("Usage: node scripts/updater-manifest.mjs VERSION DIRECTORY MAC_APP_TAR_GZ WINDOWS_EXE [NOTES_FILE]");
  const manifest = createManifest(version, macFile, windowsFile, file => {
    if (!statSync(resolve(directory, file)).isFile()) throw new Error(`Missing artifact: ${file}`);
    return readFileSync(resolve(directory, `${file}.sig`), "utf8");
  }, notesFile ? readFileSync(notesFile, "utf8") : "");
  writeFileSync(resolve(directory, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
