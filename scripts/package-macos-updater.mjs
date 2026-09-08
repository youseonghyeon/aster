import { spawnSync } from "node:child_process";
import { resolve, basename } from "node:path";

const [bundle, output] = process.argv.slice(2);
if (process.platform !== "darwin" || !bundle || !output || basename(bundle) !== "Aster.app" || !output.endsWith(".app.tar.gz")) {
  throw new Error("Usage on macOS: node scripts/package-macos-updater.mjs PATH/Aster.app OUTPUT.app.tar.gz");
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout.trim();
}
const app = resolve(bundle);
const identifier = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", `${app}/Contents/Info.plist`]);
if (identifier !== "com.yuseonghyeon.aster") throw new Error("Only the release Aster bundle may be packaged");
const arch = run("lipo", ["-archs", `${app}/Contents/MacOS/Aster`]);
if (!arch.includes("arm64") || !arch.includes("x86_64")) throw new Error("A Universal bundle is required");
run("codesign", ["--verify", "--deep", "--strict", app]);
run("xcrun", ["stapler", "validate", app]);
// AppleDouble entries such as ._Aster.app break the updater's root-stripping extractor.
run("tar", ["--no-xattrs", "-czf", resolve(output), "-C", resolve(app, ".."), "Aster.app"], {
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});
console.log("Packaged notarized Universal app. Sign this final archive before generating latest.json.");
