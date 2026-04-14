import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDir = join(repoRoot, "examples");
const exampleFiles = readdirSync(examplesDir)
    .filter((name) => name.endsWith(".ts"))
    .sort((left, right) => left.localeCompare(right));

let failures = 0;

for (const file of exampleFiles) {
    const relativePath = `examples/${file}`;
    const result = spawnSync(process.execPath, ["--import", "tsx", relativePath], {
        cwd: repoRoot,
        encoding: "utf8",
    });

    if (result.error !== undefined) {
        throw result.error;
    }

    if (result.status === 0) {
        console.log(`ok ${relativePath}`);
        continue;
    }

    failures++;
    console.error(`failed ${relativePath}`);

    if (result.stdout.trim().length > 0) {
        console.error(result.stdout.trimEnd());
    }

    if (result.stderr.trim().length > 0) {
        console.error(result.stderr.trimEnd());
    }
}

if (failures > 0) {
    throw new Error(`Examples check failed: ${failures} example${failures === 1 ? "" : "s"}.`);
}

console.log(`Checked ${exampleFiles.length} examples.`);
