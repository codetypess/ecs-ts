import type { AnyComponentEntry, AnyComponentType } from "../component";
import { formatEntity, type Entity } from "../entity";

type DependencyOrder = "dependenciesFirst" | "dependentsFirst";

/** Resolves tracked component ids without coupling this helper to Registry or World. */
export function currentEntityComponentTypes(
    componentIds: readonly number[],
    componentTypeById: (componentId: number) => AnyComponentType | undefined
): AnyComponentType[] {
    const types: AnyComponentType[] = [];

    for (const componentId of componentIds) {
        const type = componentTypeById(componentId);

        if (type !== undefined) {
            types.push(type);
        }
    }

    return types;
}

export function assertComponentDepsPresent(
    entity: Entity,
    type: AnyComponentType,
    currentTypes: readonly AnyComponentType[],
    action: string
): void {
    if (type.deps.length === 0) {
        return;
    }

    const currentTypeIds = new Set<number>(currentTypes.map((currentType) => currentType.id));

    for (const dep of type.deps) {
        if (!currentTypeIds.has(dep.id)) {
            throw new Error(
                `Cannot ${action} component ${type.name} on ${formatEntity(entity)}: missing dependency ${dep.name}`
            );
        }
    }
}

export function assertComponentHasNoDependents(
    entity: Entity,
    type: AnyComponentType,
    currentTypes: readonly AnyComponentType[],
    action: string
): void {
    if (currentTypes.length < 2) {
        return;
    }

    for (const currentType of currentTypes) {
        if (currentType.deps.some((dep) => dep.id === type.id)) {
            throw new Error(
                `Cannot ${action} component ${type.name} from ${formatEntity(entity)}: component ${currentType.name} depends on it`
            );
        }
    }
}

/** Validates that a final component set is dependency-closed after staged edits settle. */
export function assertComponentSetDepsSatisfied(
    entity: Entity,
    types: readonly AnyComponentType[],
    action: string
): void {
    if (!mayHaveDependencyChecks(types)) {
        return;
    }

    assertComponentTypeSetDepsSatisfied(types, (type, dep) => {
        throw new Error(
            `Cannot ${action} for ${formatEntity(entity)}: component ${type.name} requires ${dep.name}`
        );
    });
}

export function assertSpawnEntriesSatisfied(entries: readonly AnyComponentEntry[]): void {
    if (!entries.some((entry) => entry.type.deps.length > 0)) {
        return;
    }

    assertComponentTypeSetDepsSatisfied(uniqueEntryTypes(entries), (type, dep) => {
        throw new Error(`Cannot spawn component ${type.name}: missing dependency ${dep.name}`);
    });
}

/** Returns component types in dependency order while preserving unrelated definition order. */
export function sortComponentTypesByDependencies(
    types: readonly AnyComponentType[],
    order: DependencyOrder = "dependenciesFirst"
): AnyComponentType[] {
    if (types.length < 2) {
        return [...types];
    }

    const uniqueTypes: AnyComponentType[] = [];
    const uniqueTypeIds = new Set<number>();

    for (const type of types) {
        if (uniqueTypeIds.has(type.id)) {
            continue;
        }

        uniqueTypeIds.add(type.id);
        uniqueTypes.push(type);
    }

    if (!hasIncludedDependencyEdges(uniqueTypes, uniqueTypeIds)) {
        return [...uniqueTypes];
    }

    const dependencyRank = createDependencyRank(uniqueTypes);
    const sorted = [...uniqueTypes].sort(
        (left, right) => dependencyRank.get(left.id)! - dependencyRank.get(right.id)!
    );

    if (order === "dependentsFirst") {
        sorted.reverse();
    }

    return sorted;
}

/** Returns component entries ordered so dependencies are inserted before their dependents. */
export function sortEntriesByDependencies(
    entries: readonly AnyComponentEntry[]
): AnyComponentEntry[] {
    if (entries.length < 2) {
        return [...entries];
    }

    const uniqueTypes = uniqueEntryTypes(entries);

    if (!hasIncludedDependencyEdges(uniqueTypes, new Set(uniqueTypes.map((type) => type.id)))) {
        return [...entries];
    }

    const dependencyRank = createDependencyRank(uniqueTypes);

    return entries
        .map((entry, index) => ({ entry, index }))
        .sort((left, right) => {
            const rankDelta =
                dependencyRank.get(left.entry.type.id)! - dependencyRank.get(right.entry.type.id)!;

            if (rankDelta !== 0) {
                return rankDelta;
            }

            return left.index - right.index;
        })
        .map(({ entry }) => entry);
}

function createDependencyRank(types: readonly AnyComponentType[]): Map<number, number> {
    const includedTypeIds = new Set<number>(types.map((type) => type.id));
    const visiting = new Set<number>();
    const rankByTypeId = new Map<number, number>();
    const path: AnyComponentType[] = [];
    let nextRank = 0;

    const visit = (type: AnyComponentType): void => {
        if (rankByTypeId.has(type.id)) {
            return;
        }

        if (visiting.has(type.id)) {
            throw new Error(
                `Component dependency cycle detected: ${[...path, type]
                    .map((item) => item.name)
                    .join(" -> ")}`
            );
        }

        visiting.add(type.id);
        path.push(type);

        for (const dep of type.deps) {
            if (includedTypeIds.has(dep.id)) {
                visit(dep);
            }
        }

        path.pop();
        visiting.delete(type.id);
        // Post-order assignment guarantees every dependency receives a smaller rank.
        rankByTypeId.set(type.id, nextRank++);
    };

    for (const type of types) {
        visit(type);
    }

    return rankByTypeId;
}

function uniqueEntryTypes(entries: readonly AnyComponentEntry[]): AnyComponentType[] {
    return [...new Map(entries.map((entry) => [entry.type.id, entry.type])).values()];
}

/** Shares the same dependency-closure walk while letting callers keep context-specific errors. */
function assertComponentTypeSetDepsSatisfied(
    types: readonly AnyComponentType[],
    onMissingDependency: (type: AnyComponentType, dep: AnyComponentType) => never
): void {
    const typeIds = new Set<number>(types.map((type) => type.id));

    for (const type of types) {
        for (const dep of type.deps) {
            if (!typeIds.has(dep.id)) {
                onMissingDependency(type, dep);
            }
        }
    }
}

function mayHaveDependencyChecks(types: readonly AnyComponentType[]): boolean {
    return types.some((type) => type.deps.length > 0);
}

function hasIncludedDependencyEdges(
    types: readonly AnyComponentType[],
    includedTypeIds: ReadonlySet<number>
): boolean {
    for (const type of types) {
        for (const dep of type.deps) {
            if (includedTypeIds.has(dep.id)) {
                return true;
            }
        }
    }

    return false;
}
