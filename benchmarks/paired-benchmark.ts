import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

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

type OrderMode = "abba" | "alternate" | "baseline-first" | "current-first";
type RoundOrder = "baseline-first" | "current-first";

interface Options {
    readonly baselineDir: string;
    readonly currentDir: string;
    readonly rounds: number;
    readonly threshold: number;
    readonly order: OrderMode;
    readonly json: boolean;
    readonly benchmarkArgs: readonly string[];
}

interface RoundSummary {
    readonly round: number;
    readonly order: RoundOrder;
    readonly geometricMeanDelta: number;
}

interface BenchmarkSummaryRow {
    readonly name: string;
    readonly operations: number;
    readonly baselineMedianOps: number;
    readonly currentMedianOps: number;
    readonly medianDelta: number;
    readonly minDelta: number;
    readonly maxDelta: number;
    readonly baselineFirstMedianDelta: number | undefined;
    readonly currentFirstMedianDelta: number | undefined;
    readonly orderSkew: number | undefined;
}

interface Summary {
    readonly options: Options;
    readonly config: Readonly<Record<string, number>>;
    readonly checksum: number;
    readonly roundMedianGeometricMeanDelta: number;
    readonly rounds: readonly RoundSummary[];
    readonly rows: readonly BenchmarkSummaryRow[];
    readonly failed: boolean;
    readonly biased: boolean;
}

const options = parseOptions(process.argv.slice(2));
const summary = runPairedBenchmarks(options);

if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
} else {
    printSummary(summary);
}

if (summary.failed) {
    process.exitCode = 1;
}

function runPairedBenchmarks(options: Options): Summary {
    const rounds: RoundSummary[] = [];
    const baselineDir = resolve(options.baselineDir);
    const currentDir = resolve(options.currentDir);
    const baselineOpsByName = new Map<string, number[]>();
    const currentOpsByName = new Map<string, number[]>();
    const deltasByName = new Map<string, number[]>();
    const baselineFirstDeltasByName = new Map<string, number[]>();
    const currentFirstDeltasByName = new Map<string, number[]>();

    let referenceConfig: Readonly<Record<string, number>> | undefined;
    let referenceChecksum: number | undefined;
    let referenceOperationsByName: ReadonlyMap<string, number> | undefined;

    for (let index = 0; index < options.rounds; index++) {
        const order = resolveRoundOrder(index, options.order);
        const round = index + 1;

        const baselineReport =
            order === "baseline-first"
                ? runBenchmark(baselineDir, "baseline", options.benchmarkArgs)
                : undefined;
        const currentReport =
            order === "current-first"
                ? runBenchmark(currentDir, "current", options.benchmarkArgs)
                : undefined;
        const completedBaseline =
            baselineReport ?? runBenchmark(baselineDir, "baseline", options.benchmarkArgs);
        const completedCurrent =
            currentReport ?? runBenchmark(currentDir, "current", options.benchmarkArgs);

        assertComparableReports(completedBaseline, completedCurrent);

        if (referenceConfig === undefined) {
            referenceConfig = completedBaseline.config;
            referenceChecksum = completedBaseline.checksum;
            referenceOperationsByName = new Map(
                completedBaseline.results.map((result) => [result.name, result.operations])
            );
        } else {
            const operationsByName = referenceOperationsByName;

            if (operationsByName === undefined) {
                throw new Error("Missing benchmark operation reference for paired rounds.");
            }

            if (!sameConfig(referenceConfig, completedBaseline.config)) {
                throw new Error("Benchmark config changed between paired rounds.");
            }

            if (referenceChecksum !== completedBaseline.checksum) {
                throw new Error("Benchmark checksum changed between paired rounds.");
            }

            assertSameOperations(operationsByName, completedBaseline.results, "baseline");
            assertSameOperations(operationsByName, completedCurrent.results, "current");
        }

        const currentByName = new Map(
            completedCurrent.results.map((result) => [result.name, result] as const)
        );
        const ratios: number[] = [];

        for (const baselineResult of completedBaseline.results) {
            const currentResult = currentByName.get(baselineResult.name)!;
            const ratio = currentResult.opsPerSecond / baselineResult.opsPerSecond;
            const delta = ratio - 1;

            ratios.push(ratio);
            pushNumber(baselineOpsByName, baselineResult.name, baselineResult.opsPerSecond);
            pushNumber(currentOpsByName, currentResult.name, currentResult.opsPerSecond);
            pushNumber(deltasByName, baselineResult.name, delta);

            if (order === "baseline-first") {
                pushNumber(baselineFirstDeltasByName, baselineResult.name, delta);
            } else {
                pushNumber(currentFirstDeltasByName, baselineResult.name, delta);
            }
        }

        rounds.push({
            round,
            order,
            geometricMeanDelta: geometricMean(ratios) - 1,
        });
    }

    const operationsByName = referenceOperationsByName;

    if (
        referenceConfig === undefined ||
        referenceChecksum === undefined ||
        operationsByName === undefined
    ) {
        throw new Error("No paired benchmark rounds were collected.");
    }

    const rows = Array.from(deltasByName.entries())
        .map(([name, deltas]) => {
            const baselineMedianOps = median(baselineOpsByName.get(name)!);
            const currentMedianOps = median(currentOpsByName.get(name)!);
            const baselineFirstMedianDelta = medianOrUndefined(baselineFirstDeltasByName.get(name));
            const currentFirstMedianDelta = medianOrUndefined(currentFirstDeltasByName.get(name));

            return {
                name,
                operations: operationsByName.get(name)!,
                baselineMedianOps,
                currentMedianOps,
                medianDelta: median(deltas),
                minDelta: Math.min(...deltas),
                maxDelta: Math.max(...deltas),
                baselineFirstMedianDelta,
                currentFirstMedianDelta,
                orderSkew:
                    baselineFirstMedianDelta === undefined || currentFirstMedianDelta === undefined
                        ? undefined
                        : baselineFirstMedianDelta - currentFirstMedianDelta,
            };
        })
        .sort((left, right) => left.medianDelta - right.medianDelta);

    const roundMedianGeometricMeanDelta = median(rounds.map((round) => round.geometricMeanDelta));
    const failed = rows.some((row) => row.medianDelta < -options.threshold);
    const biased = rows.some(
        (row) => row.orderSkew !== undefined && Math.abs(row.orderSkew) >= options.threshold
    );

    return {
        options,
        config: referenceConfig,
        checksum: referenceChecksum,
        roundMedianGeometricMeanDelta,
        rounds,
        rows,
        failed,
        biased,
    };
}

function runBenchmark(
    cwd: string,
    label: string,
    benchmarkArgs: readonly string[]
): BenchmarkReport {
    try {
        const output = execFileSync(
            process.execPath,
            ["--import", "tsx", "benchmarks/ecs-benchmark.ts", "--json", ...benchmarkArgs],
            {
                cwd,
                encoding: "utf8",
                maxBuffer: 64 * 1024 * 1024,
            }
        );

        return validateReport(JSON.parse(output) as unknown, label);
    } catch (error) {
        const detail = formatExecError(error);
        throw new Error(`Failed to run ${label} benchmark in ${cwd}.\n${detail}`);
    }
}

function resolveRoundOrder(index: number, order: OrderMode): RoundOrder {
    if (order === "baseline-first" || order === "current-first") {
        return order;
    }

    if (order === "alternate") {
        return index % 2 === 0 ? "baseline-first" : "current-first";
    }

    const pattern: readonly RoundOrder[] = [
        "baseline-first",
        "current-first",
        "current-first",
        "baseline-first",
    ];

    return pattern[index % pattern.length]!;
}

function assertComparableReports(
    baselineReport: BenchmarkReport,
    currentReport: BenchmarkReport
): void {
    if (!sameConfig(baselineReport.config, currentReport.config)) {
        throw new Error("Benchmark config mismatch; regenerate the paired baseline.");
    }

    if (baselineReport.checksum !== currentReport.checksum) {
        throw new Error(
            `Benchmark checksum mismatch: baseline=${baselineReport.checksum}, current=${currentReport.checksum}`
        );
    }

    const baselineOperationsByName = new Map(
        baselineReport.results.map((result) => [result.name, result.operations])
    );

    assertSameOperations(baselineOperationsByName, currentReport.results, "current");
}

function assertSameOperations(
    referenceOperationsByName: ReadonlyMap<string, number>,
    results: readonly BenchmarkResult[],
    label: string
): void {
    for (const result of results) {
        const expectedOperations = referenceOperationsByName.get(result.name);

        if (expectedOperations === undefined) {
            throw new Error(`Unexpected ${label} benchmark result: ${result.name}`);
        }

        if (expectedOperations !== result.operations) {
            throw new Error(
                `Benchmark operation mismatch for ${result.name}: expected ${expectedOperations}, got ${result.operations}`
            );
        }
    }

    if (results.length !== referenceOperationsByName.size) {
        throw new Error(`Missing ${label} benchmark results.`);
    }
}

function pushNumber(target: Map<string, number[]>, key: string, value: number): void {
    const current = target.get(key);

    if (current === undefined) {
        target.set(key, [value]);
        return;
    }

    current.push(value);
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1]! + sorted[middle]!) / 2;
    }

    return sorted[middle]!;
}

function medianOrUndefined(values: readonly number[] | undefined): number | undefined {
    return values === undefined || values.length === 0 ? undefined : median(values);
}

function geometricMean(values: readonly number[]): number {
    return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function printSummary(summary: Summary): void {
    console.log(`rounds=${summary.options.rounds}, order=${summary.options.order}`);
    console.log(
        `baseline=${resolve(summary.options.baselineDir)}, current=${resolve(summary.options.currentDir)}`
    );
    console.log(
        `median round geometric mean delta=${formatPercent(summary.roundMedianGeometricMeanDelta)}`
    );
    console.log(`threshold=${formatPercent(summary.options.threshold)}`);

    if (summary.options.benchmarkArgs.length > 0) {
        console.log(`forwarded args=${summary.options.benchmarkArgs.join(" ")}`);
    }

    console.log(
        "benchmark".padEnd(36),
        "baseline med".padStart(16),
        "current med".padStart(16),
        "med delta".padStart(10),
        "B->C".padStart(10),
        "C->B".padStart(10),
        "status".padStart(8)
    );

    for (const row of summary.rows) {
        const status =
            row.medianDelta < -summary.options.threshold
                ? "fail"
                : row.orderSkew !== undefined &&
                    Math.abs(row.orderSkew) >= summary.options.threshold
                  ? "bias"
                  : "ok";

        console.log(
            row.name.padEnd(36),
            formatOps(row.baselineMedianOps).padStart(16),
            formatOps(row.currentMedianOps).padStart(16),
            formatPercent(row.medianDelta).padStart(10),
            formatDelta(row.baselineFirstMedianDelta).padStart(10),
            formatDelta(row.currentFirstMedianDelta).padStart(10),
            status.padStart(8)
        );
    }

    if (summary.failed) {
        console.error("Paired benchmark comparison failed.");
        return;
    }

    if (summary.biased) {
        console.warn(
            "Paired benchmark comparison passed, but some rows still show strong order skew."
        );
        return;
    }

    console.log("No paired benchmark regressions above threshold.");
}

function parseOptions(args: readonly string[]): Options {
    let baselineDir: string | undefined;
    let currentDir: string | undefined;
    let rounds = 6;
    let threshold = 0.15;
    let order: OrderMode = "abba";
    let json = false;
    let benchmarkArgs: readonly string[] = [];

    for (let index = 0; index < args.length; index++) {
        const arg = args[index]!;

        if (arg === "--") {
            benchmarkArgs = args.slice(index + 1);
            break;
        }

        if (arg === "--help" || arg === "-h") {
            printUsage();
            process.exit(0);
        }

        if (arg === "--baseline-dir") {
            baselineDir = requireValue(args, ++index, arg);
            continue;
        }

        if (arg.startsWith("--baseline-dir=")) {
            baselineDir = arg.slice("--baseline-dir=".length);
            continue;
        }

        if (arg === "--current-dir") {
            currentDir = requireValue(args, ++index, arg);
            continue;
        }

        if (arg.startsWith("--current-dir=")) {
            currentDir = arg.slice("--current-dir=".length);
            continue;
        }

        if (arg === "--rounds") {
            rounds = parseRounds(requireValue(args, ++index, arg));
            continue;
        }

        if (arg.startsWith("--rounds=")) {
            rounds = parseRounds(arg.slice("--rounds=".length));
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

        if (arg === "--order") {
            order = parseOrder(requireValue(args, ++index, arg));
            continue;
        }

        if (arg.startsWith("--order=")) {
            order = parseOrder(arg.slice("--order=".length));
            continue;
        }

        if (arg === "--json") {
            json = true;
            continue;
        }

        throw new Error(`Unknown option: ${arg}`);
    }

    if (baselineDir === undefined || currentDir === undefined) {
        printUsage();
        throw new Error("Missing --baseline-dir or --current-dir.");
    }

    return {
        baselineDir,
        currentDir,
        rounds,
        threshold,
        order,
        json,
        benchmarkArgs,
    };
}

function parseRounds(value: string): number {
    const rounds = Number(value);

    if (!Number.isInteger(rounds) || rounds < 1) {
        throw new Error(`Invalid rounds: ${value}`);
    }

    return rounds;
}

function parseThreshold(value: string): number {
    const parsed = value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
    const threshold = parsed > 1 ? parsed / 100 : parsed;

    if (!Number.isFinite(threshold) || threshold < 0 || threshold >= 1) {
        throw new Error(`Invalid threshold: ${value}`);
    }

    return threshold;
}

function parseOrder(value: string): OrderMode {
    if (
        value === "abba" ||
        value === "alternate" ||
        value === "baseline-first" ||
        value === "current-first"
    ) {
        return value;
    }

    throw new Error(`Invalid order: ${value}`);
}

function requireValue(args: readonly string[], index: number, option: string): string {
    const value = args[index];

    if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${option}.`);
    }

    return value;
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

function formatOps(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

function formatDelta(value: number | undefined): string {
    return value === undefined ? "-" : formatPercent(value);
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function formatExecError(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }

    const stdout = "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const detail = [stderr.trim(), stdout.trim(), error.message].find((value) => value.length > 0);

    return detail ?? error.message;
}

function printUsage(): void {
    console.log(
        [
            "Usage: tsx benchmarks/paired-benchmark.ts --baseline-dir <path> --current-dir <path> [--rounds 6] [--order abba|alternate|baseline-first|current-first] [--threshold 15%] [--json] [-- <benchmark args>]",
            "",
            "Run paired benchmark rounds against two directories, alternating order to reduce version-order bias.",
            "Arguments after -- are forwarded directly to ecs-benchmark.ts, for example:",
            "  tsx benchmarks/paired-benchmark.ts --baseline-dir /tmp/ecs-base --current-dir . --rounds 6 -- --profile smoke --only query",
        ].join("\n")
    );
}
