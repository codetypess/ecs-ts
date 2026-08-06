import type { AnyComponentEntry, AnyComponentType } from "../component.js";
import { formatEntity, type Entity } from "../entity.js";

type DependencyOrder = "dependenciesFirst" | "dependentsFirst";
type DependencyRank = Map<AnyComponentType, number>;

export function currentEntityComponentTypes(
    types: readonly AnyComponentType[]
): AnyComponentType[] {
    return [...types];
}

export function assertComponentDepsPresent(
    entity: Entity,
    type: AnyComponentType,
    currentTypes: readonly AnyComponentType[],
    action: string
): void {
    if (type.deps.length === 0) return;
    const current = new Set(currentTypes);

    for (const dep of type.deps) {
        if (!current.has(dep)) {
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
    if (currentTypes.length < 2) return;

    for (const current of currentTypes) {
        for (const dep of current.deps) {
            if (dep === type) {
                throw new Error(
                    `Cannot ${action} component ${type.name} from ${formatEntity(entity)}: component ${current.name} depends on it`
                );
            }
        }
    }
}

export function assertComponentSetDepsSatisfied(
    entity: Entity,
    types: readonly AnyComponentType[],
    action: string
): void {
    if (!types.some((type) => type.deps.length > 0)) return;

    assertComponentTypeSetDepsSatisfied(types, (type, dep) => {
        throw new Error(
            `Cannot ${action} for ${formatEntity(entity)}: component ${type.name} requires ${dep.name}`
        );
    });
}

export function assertSpawnEntriesSatisfied(entries: readonly AnyComponentEntry[]): void {
    if (!entries.some((entry) => entry.type.deps.length > 0)) return;

    assertComponentTypeSetDepsSatisfied(uniqueEntryTypes(entries), (type, dep) => {
        throw new Error(`Cannot spawn component ${type.name}: missing dependency ${dep.name}`);
    });
}

export function entriesHaveDependencyChecks(entries: readonly AnyComponentEntry[]): boolean {
    return entries.some((entry) => entry.type.deps.length > 0);
}

export function sortComponentTypesByDependencies(
    types: readonly AnyComponentType[],
    order: DependencyOrder = "dependenciesFirst"
): AnyComponentType[] {
    if (types.length < 2) return [...types];

    const unique: AnyComponentType[] = [];
    const included = new Set<AnyComponentType>();

    for (const type of types) {
        if (!included.has(type)) {
            included.add(type);
            unique.push(type);
        }
    }

    if (!hasIncludedDependencyEdges(unique, included)) return [...unique];

    const ranks = createDependencyRank(unique, included);
    if (isTypeOrderSorted(unique, ranks, order)) return [...unique];

    const direction = order === "dependenciesFirst" ? 1 : -1;
    return [...unique].sort((left, right) => direction * (ranks.get(left)! - ranks.get(right)!));
}

export function sortEntriesByDependencies(
    entries: readonly AnyComponentEntry[]
): AnyComponentEntry[] {
    if (entries.length < 2) return [...entries];

    const included = new Set<AnyComponentType>();
    const unique = uniqueEntryTypes(entries, included);
    if (!hasIncludedDependencyEdges(unique, included)) return [...entries];

    const ranks = createDependencyRank(unique, included);
    if (areEntriesInDependencyOrder(entries, ranks)) return [...entries];

    return [...entries].sort((left, right) => ranks.get(left.type)! - ranks.get(right.type)!);
}

function createDependencyRank(
    types: readonly AnyComponentType[],
    included: ReadonlySet<AnyComponentType>
): DependencyRank {
    const visiting = new Set<AnyComponentType>();
    const ranks = new Map<AnyComponentType, number>();
    const path: AnyComponentType[] = [];
    let next = 0;

    const visit = (type: AnyComponentType): void => {
        if (ranks.has(type)) return;
        if (visiting.has(type)) {
            throw new Error(
                `Component dependency cycle detected: ${[...path, type]
                    .map((item) => item.name)
                    .join(" -> ")}`
            );
        }

        visiting.add(type);
        path.push(type);
        for (const dep of type.deps) {
            if (included.has(dep)) visit(dep);
        }
        path.pop();
        visiting.delete(type);
        ranks.set(type, next++);
    };

    for (const type of types) visit(type);
    return ranks;
}

function uniqueEntryTypes(
    entries: readonly AnyComponentEntry[],
    included = new Set<AnyComponentType>()
): AnyComponentType[] {
    const unique: AnyComponentType[] = [];

    for (const entry of entries) {
        if (!included.has(entry.type)) {
            included.add(entry.type);
            unique.push(entry.type);
        }
    }

    return unique;
}

function assertComponentTypeSetDepsSatisfied(
    types: readonly AnyComponentType[],
    onMissing: (type: AnyComponentType, dep: AnyComponentType) => never
): void {
    const typeSet = new Set(types);

    for (const type of types) {
        for (const dep of type.deps) {
            if (!typeSet.has(dep)) onMissing(type, dep);
        }
    }
}

function hasIncludedDependencyEdges(
    types: readonly AnyComponentType[],
    included: ReadonlySet<AnyComponentType>
): boolean {
    return types.some((type) => type.deps.some((dep) => included.has(dep)));
}

function isTypeOrderSorted(
    types: readonly AnyComponentType[],
    ranks: DependencyRank,
    order: DependencyOrder
): boolean {
    let previous = ranks.get(types[0]!)!;

    for (let index = 1; index < types.length; index++) {
        const rank = ranks.get(types[index]!)!;
        if (order === "dependenciesFirst" ? previous > rank : previous < rank) return false;
        previous = rank;
    }

    return true;
}

function areEntriesInDependencyOrder(
    entries: readonly AnyComponentEntry[],
    ranks: DependencyRank
): boolean {
    let previous = ranks.get(entries[0]!.type)!;

    for (let index = 1; index < entries.length; index++) {
        const rank = ranks.get(entries[index]!.type)!;
        if (previous > rank) return false;
        previous = rank;
    }

    return true;
}
