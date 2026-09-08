import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function profileArgs(args, env = process.env) {
  const [command, ...options] = args;
  if (!["dev", "build", "preview"].includes(command)) return args;
  if (env.TAURI_CONFIG || options.some((arg) =>
    arg === "--config" || arg.startsWith("--config=") || arg.startsWith("-c"))) {
    throw new Error("앱 식별자는 고정입니다. 별도 config 대신 dev/build/preview 명령을 사용하세요.");
  }
  if (command === "preview") {
    if (options.some((arg) => arg === "--no-bundle" || arg.startsWith("--bundles") || arg.startsWith("-b") || arg === "--debug" || arg === "-d")) {
      throw new Error("Preview는 release .app 번들로 고정됩니다.");
    }
    return ["build", ...options, "--config", "src-tauri/tauri.preview.conf.json", "--bundles", "app"];
  }
  return command === "dev"
    ? ["dev", ...options, "--config", "src-tauri/tauri.dev.conf.json"]
    : args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = profileArgs(process.argv.slice(2));
    const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tauri", ...args], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
