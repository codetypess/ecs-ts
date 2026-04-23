import type { AnyComponentEntry, AnyComponentType } from "../component.js";
import { formatEntity, type Entity } from "../entity.js";

type DependencyOrder = "dependenciesFirst" | "dependentsFirst";
type DependencyRank = number[];

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

    const currentTypeIds = new Set<number>();

    for (const currentType of currentTypes) {
        currentTypeIds.add(currentType.id);
    }

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
        for (const dep of currentType.deps) {
            if (dep.id === type.id) {
                throw new Error(
                    `Cannot ${action} component ${type.name} from ${formatEntity(entity)}: component ${currentType.name} depends on it`
                );
            }
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
    if (!entriesHaveDependencyChecks(entries)) {
        return;
    }

    assertComponentTypeSetDepsSatisfied(uniqueEntryTypes(entries), (type, dep) => {
        throw new Error(`Cannot spawn component ${type.name}: missing dependency ${dep.name}`);
    });
}

export function entriesHaveDependencyChecks(entries: readonly AnyComponentEntry[]): boolean {
    for (const entry of entries) {
        if (entry.type.deps.length > 0) {
            return true;
        }
    }

    return false;
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

    const dependencyRank = createDependencyRank(uniqueTypes, uniqueTypeIds);

    if (isTypeOrderSorted(uniqueTypes, dependencyRank, order)) {
        return [...uniqueTypes];
    }

    const direction = order === "dependenciesFirst" ? 1 : -1;

    return [...uniqueTypes].sort(
        (left, right) => direction * (dependencyRank[left.id]! - dependencyRank[right.id]!)
    );
}

/** Returns component entries ordered so dependencies are inserted before their dependents. */
export function sortEntriesByDependencies(
    entries: readonly AnyComponentEntry[]
): AnyComponentEntry[] {
    if (entries.length < 2) {
        return [...entries];
    }

    const uniqueTypeIds = new Set<number>();
    const uniqueTypes = uniqueEntryTypes(entries, uniqueTypeIds);

    if (!hasIncludedDependencyEdges(uniqueTypes, uniqueTypeIds)) {
        return [...entries];
    }

    const dependencyRank = createDependencyRank(uniqueTypes, uniqueTypeIds);

    if (areEntriesInDependencyOrder(entries, dependencyRank)) {
        return [...entries];
    }

    // ES2019+ stable sort preserves caller order for duplicate or same-rank entries.
    return [...entries].sort(
        (left, right) => dependencyRank[left.type.id]! - dependencyRank[right.type.id]!
    );
}

function createDependencyRank(
    types: readonly AnyComponentType[],
    includedTypeIds: ReadonlySet<number>
): DependencyRank {
    // Component ids are dense per registry, so arrays avoid Map lookups in sort comparators.
    const visiting: boolean[] = [];
    const rankByTypeId: DependencyRank = [];
    const path: AnyComponentType[] = [];
    let nextRank = 0;

    const visit = (type: AnyComponentType): void => {
        if (rankByTypeId[type.id] !== undefined) {
            return;
        }

        if (visiting[type.id] === true) {
            throw new Error(
                `Component dependency cycle detected: ${[...path, type]
                    .map((item) => item.name)
                    .join(" -> ")}`
            );
        }

        visiting[type.id] = true;
        path.push(type);

        for (const dep of type.deps) {
            // Missing external deps are validated separately; rank only edges within this set.
            if (includedTypeIds.has(dep.id)) {
                visit(dep);
            }
        }

        path.pop();
        visiting[type.id] = false;
        // Post-order assignment guarantees every dependency receives a smaller rank.
        rankByTypeId[type.id] = nextRank++;
    };

    for (const type of types) {
        visit(type);
    }

    return rankByTypeId;
}

function uniqueEntryTypes(
    entries: readonly AnyComponentEntry[],
    uniqueTypeIds = new Set<number>()
): AnyComponentType[] {
    const uniqueTypes: AnyComponentType[] = [];

    for (const entry of entries) {
        const type = entry.type;

        if (uniqueTypeIds.has(type.id)) {
            continue;
        }

        uniqueTypeIds.add(type.id);
        uniqueTypes.push(type);
    }

    return uniqueTypes;
}

/** Shares the same dependency-closure walk while letting callers keep context-specific errors. */
function assertComponentTypeSetDepsSatisfied(
    types: readonly AnyComponentType[],
    onMissingDependency: (type: AnyComponentType, dep: AnyComponentType) => never
): void {
    const typeIds = new Set<number>();

    for (const type of types) {
        typeIds.add(type.id);
    }

    for (const type of types) {
        for (const dep of type.deps) {
            if (!typeIds.has(dep.id)) {
                onMissingDependency(type, dep);
            }
        }
    }
}

function mayHaveDependencyChecks(types: readonly AnyComponentType[]): boolean {
    for (const type of types) {
        if (type.deps.length > 0) {
            return true;
        }
    }

    return false;
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

function isTypeOrderSorted(
    types: readonly AnyComponentType[],
    dependencyRank: DependencyRank,
    order: DependencyOrder
): boolean {
    let previousRank = dependencyRank[types[0]!.id]!;

    for (let index = 1; index < types.length; index++) {
        const rank = dependencyRank[types[index]!.id]!;

        if (order === "dependenciesFirst" ? previousRank > rank : previousRank < rank) {
            return false;
        }

        previousRank = rank;
    }

    return true;
}

function areEntriesInDependencyOrder(
    entries: readonly AnyComponentEntry[],
    dependencyRank: DependencyRank
): boolean {
    let previousRank = dependencyRank[entries[0]!.type.id]!;

    for (let index = 1; index < entries.length; index++) {
        const rank = dependencyRank[entries[index]!.type.id]!;

        if (previousRank > rank) {
            return false;
        }

        previousRank = rank;
    }

    return true;
}
