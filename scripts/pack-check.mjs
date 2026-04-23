import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "ecs-ts-npm-cache-"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const result = spawnSync(npmCommand, ["pack", "--dry-run"], {
    cwd: process.cwd(),
    env: {
        ...process.env,
        npm_config_cache: cacheDir,
    },
    stdio: "inherit",
});

if (result.status !== 0) {
    process.exit(result.status ?? 1);
}
