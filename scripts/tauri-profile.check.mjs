import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { profileArgs } from "./tauri-profile.mjs";

test("development, preview and distribution retain distinct identities", () => {
  const base = JSON.parse(readFileSync("src-tauri/tauri.conf.json"));
  for (const [command, name, identifier] of [
    ["dev", "Aster Dev", "com.yuseonghyeon.aster.dev"],
    ["preview", "Aster Preview", "com.yuseonghyeon.aster.preview"],
    ["build", "Aster", "com.yuseonghyeon.aster"],
  ]) {
    const args = profileArgs([command], {});
    const configIndex = args.indexOf("--config");
    const config = configIndex < 0 ? base : { ...base, ...JSON.parse(readFileSync(args[configIndex + 1])) };
    assert.equal(config.productName, name);
    assert.equal(config.identifier, identifier);
    if (command === "preview") assert.deepEqual(args.slice(-2), ["--bundles", "app"]);
  }
});

test("rejects alternate identity overrides and preview installer targets", () => {
  for (const command of ["dev", "preview", "build"]) {
    for (const option of ["--config", "--config={}", "-c", "-cother.json"]) {
      assert.throws(() => profileArgs([command, option], {}));
    }
    assert.throws(() => profileArgs([command], { TAURI_CONFIG: "{}" }));
  }
  for (const option of ["--bundles=dmg", "-b", "--no-bundle", "--debug"]) {
    assert.throws(() => profileArgs(["preview", option], {}));
  }
  assert.deepEqual(profileArgs(["build", "--bundles", "nsis"], {}), ["build", "--bundles", "nsis"]);
});
