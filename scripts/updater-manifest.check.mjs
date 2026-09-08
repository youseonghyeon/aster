import { test } from "node:test";
import assert from "node:assert/strict";
import { createManifest } from "./updater-manifest.mjs";
const signature = Buffer.from("untrusted comment: test fixture\nTEST").toString("base64");
test("universal macOS uses one signed artifact for both architectures", () => {
  const files = [];
  const result = createManifest("1.9.0", "Aster.app.tar.gz", "Aster_1.9.0_x64-setup.exe", file => { files.push(file); return signature; });
  assert.deepEqual(result.platforms['darwin-aarch64'], result.platforms['darwin-x86_64']);
  assert.equal(result.platforms['windows-x86_64'].url, "https://github.com/youseonghyeon/aster/releases/download/v1.9.0/Aster_1.9.0_x64-setup.exe");
  assert.equal(files.length, 2);
});
test("does not publish unsigned or unexpected artifacts", () => {
  assert.throws(() => createManifest("1.9.0", "Aster.app.tar.gz", "Aster_1.9.0_x64-setup.exe", () => ""));
  assert.throws(() => createManifest("1.9.0", "Aster.dmg", "Aster_1.9.0_x64-setup.exe", () => signature));
  assert.throws(() => createManifest("latest", "Aster.app.tar.gz", "Aster_1.9.0_x64-setup.exe", () => signature));
  assert.throws(() => createManifest("1.9.0", "../Aster.app.tar.gz", "Aster_1.9.0_x64-setup.exe", () => signature));
});
