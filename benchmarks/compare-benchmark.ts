import { readFileSync } from "node:fs";

interface BenchmarkResult {
    readonly name: string;
    readonly operations: number;
    readonly opsPerSecond: number;
}

interface BenchmarkReport {
    readonly formatVersion: 1;
    readonly config: Readonly<Record<string, number>>;
    readonly checksum: number;
    readonly results: readonly BenchmarkResult[];
}

interface Options {
    readonly baselinePath: string;
    readonly currentPath: string;
    readonly threshold: number;
}

const options = parseOptions(process.argv.slice(2));
const baseline = readReport(options.baselinePath, "baseline");
const current = readReport(options.currentPath, "current");
const failed = compareReports(baseline, current, options.threshold);

if (failed) {
    process.exitCode = 1;
}

function compareReports(
    baselineReport: BenchmarkReport,
    currentReport: BenchmarkReport,
    threshold: number
): boolean {
    if (!sameConfig(baselineReport.config, currentReport.config)) {
        throw new Error("Benchmark config mismatch; regenerate the baseline for this config.");
    }

    if (baselineReport.checksum !== currentReport.checksum) {
        throw new Error(
            `Benchmark checksum mismatch: baseline=${baselineReport.checksum}, current=${currentReport.checksum}`
        );
    }

    const currentByName = new Map(currentReport.results.map((result) => [result.name, result]));
    const baselineNames = new Set(baselineReport.results.map((result) => result.name));
    let failed = false;

    console.log(`threshold=${formatPercent(threshold)}`);
    console.log(
        "benchmark".padEnd(36),
        "baseline ops/s".padStart(16),
        "current ops/s".padStart(16),
        "delta".padStart(10),
        "status".padStart(8)
    );

    for (const baselineResult of baselineReport.results) {
        const currentResult = currentByName.get(baselineResult.name);

        if (currentResult === undefined) {
            failed = true;
            printRow(
                baselineResult.name,
                baselineResult.opsPerSecond,
                undefined,
                undefined,
                "missing"
            );
            continue;
        }

        if (baselineResult.operations !== currentResult.operations) {
            failed = true;
            printRow(
                baselineResult.name,
                baselineResult.opsPerSecond,
                currentResult.opsPerSecond,
                undefined,
                "ops mismatch"
            );
            continue;
        }

        const delta = currentResult.opsPerSecond / baselineResult.opsPerSecond - 1;
        const status = delta < -threshold ? "fail" : "ok";

        if (status === "fail") {
            failed = true;
        }

        printRow(
            baselineResult.name,
            baselineResult.opsPerSecond,
            currentResult.opsPerSecond,
            delta,
            status
        );
    }

    for (const currentResult of currentReport.results) {
        if (!baselineNames.has(currentResult.name)) {
            printRow(currentResult.name, undefined, currentResult.opsPerSecond, undefined, "new");
        }
    }

    if (failed) {
        console.error("Benchmark comparison failed.");
    } else {
        console.log("No benchmark regressions above threshold.");
    }

    return failed;
}

function printRow(
    name: string,
    baselineOps: number | undefined,
    currentOps: number | undefined,
    delta: number | undefined,
    status: string
): void {
    console.log(
        name.padEnd(36),
        formatOps(baselineOps).padStart(16),
        formatOps(currentOps).padStart(16),
        formatDelta(delta).padStart(10),
        status.padStart(8)
    );
}

function readReport(path: string, label: string): BenchmarkReport {
    let value: unknown;

    try {
        value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(
                `Invalid ${label} report JSON at ${path}; generate raw JSON with npm --silent run benchmark:json.`
            );
        }

        throw error;
    }

    return validateReport(value, label);
}

function validateReport(value: unknown, label: string): BenchmarkReport {
    if (!isRecord(value)) {
        throw new Error(`Invalid ${label} report: expected object.`);
    }

    if (value.formatVersion !== 1) {
        throw new Error(`Invalid ${label} report: expected formatVersion 1.`);
    }

    if (!isNumberRecord(value.config)) {
        throw new Error(`Invalid ${label} report: expected numeric config object.`);
    }

    if (!isFiniteNumber(value.checksum)) {
        throw new Error(`Invalid ${label} report: expected numeric checksum.`);
    }

    if (!Array.isArray(value.results)) {
        throw new Error(`Invalid ${label} report: expected results array.`);
    }

    const results = value.results.map((result, index) => validateResult(result, label, index));

    return {
        formatVersion: 1,
        config: value.config,
        checksum: value.checksum,
        results,
    };
}

function validateResult(value: unknown, label: string, index: number): BenchmarkResult {
    if (!isRecord(value)) {
        throw new Error(`Invalid ${label} result at index ${index}: expected object.`);
    }

    if (typeof value.name !== "string") {
        throw new Error(`Invalid ${label} result at index ${index}: expected name.`);
    }

    if (!isFiniteNumber(value.operations)) {
        throw new Error(`Invalid ${label} result at index ${index}: expected operations.`);
    }

    if (!isFiniteNumber(value.opsPerSecond) || value.opsPerSecond <= 0) {
        throw new Error(
            `Invalid ${label} result at index ${index}: expected positive opsPerSecond.`
        );
    }

    return {
        name: value.name,
        operations: value.operations,
        opsPerSecond: value.opsPerSecond,
    };
}

function parseOptions(args: readonly string[]): Options {
    let baselinePath: string | undefined;
    let currentPath: string | undefined;
    let threshold = 0.15;

    for (let index = 0; index < args.length; index++) {
        const arg = args[index]!;

        if (arg === "--help" || arg === "-h") {
            printUsage();
            process.exit(0);
        }

        if (arg === "--baseline") {
            baselinePath = requireValue(args, ++index, arg);
            continue;
        }

        if (arg.startsWith("--baseline=")) {
            baselinePath = arg.slice("--baseline=".length);
            continue;
        }

        if (arg === "--current") {
            currentPath = requireValue(args, ++index, arg);
            continue;
        }

        if (arg.startsWith("--current=")) {
            currentPath = arg.slice("--current=".length);
            continue;
        }

        if (arg === "--threshold") {
            threshold = parseThreshold(requireValue(args, ++index, arg));
            continue;
        }

        if (arg.startsWith("--threshold=")) {
            threshold = parseThreshold(arg.slice("--threshold=".length));
            continue;
        }

        throw new Error(`Unknown option: ${arg}`);
    }

    if (baselinePath === undefined || currentPath === undefined) {
        printUsage();
        throw new Error("Missing --baseline or --current.");
    }

    return { baselinePath, currentPath, threshold };
}

function parseThreshold(value: string): number {
    const parsed = value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
    const threshold = parsed > 1 ? parsed / 100 : parsed;

    if (!Number.isFinite(threshold) || threshold < 0 || threshold >= 1) {
        throw new Error(`Invalid threshold: ${value}`);
    }

    return threshold;
}

function requireValue(args: readonly string[], index: number, option: string): string {
    const value = args[index];

    if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${option}.`);
    }

    return value;
}

function sameConfig(
    left: Readonly<Record<string, number>>,
    right: Readonly<Record<string, number>>
): boolean {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length) {
        return false;
    }

    return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isNumberRecord(value: unknown): value is Record<string, number> {
    if (!isRecord(value)) {
        return false;
    }

    return Object.values(value).every(isFiniteNumber);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function formatOps(value: number | undefined): string {
    return value === undefined ? "-" : Math.round(value).toLocaleString("en-US");
}

function formatDelta(value: number | undefined): string {
    return value === undefined ? "-" : formatPercent(value);
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function printUsage(): void {
    console.log(
        [
            "Usage: tsx benchmarks/compare-benchmark.ts --baseline <path> --current <path> [--threshold 15%]",
            "",
            "Compare two raw benchmark JSON reports and fail when current ops/sec regresses beyond the threshold.",
        ].join("\n")
    );
}
