const ENTITY_INDEX_CAPACITY = 2 ** 20;

export type Entity = number & { readonly __entity: unique symbol };

export function entityIndex(entity: Entity): number {
    return entity % ENTITY_INDEX_CAPACITY;
}

export function entityGeneration(entity: Entity): number {
    return Math.floor(entity / ENTITY_INDEX_CAPACITY);
}

export function formatEntity(entity: Entity): string {
    return `${entityIndex(entity)}v${entityGeneration(entity)}`;
}

function makeEntity(index: number, generation: number): Entity {
    return (generation * ENTITY_INDEX_CAPACITY + index) as Entity;
}

export class EntityManager {
    private readonly generations: number[] = [];
    private readonly alive: boolean[] = [];
    private readonly free: number[] = [];

    create(): Entity {
        const index = this.free.length > 0 ? this.free.pop()! : this.generations.length;

        if (index >= ENTITY_INDEX_CAPACITY) {
            throw new Error(`Entity index capacity exceeded: ${ENTITY_INDEX_CAPACITY}`);
        }

        this.generations[index] ??= 1;
        this.alive[index] = true;

        return makeEntity(index, this.generations[index]);
    }

    destroy(entity: Entity): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        const index = entityIndex(entity);
        this.alive[index] = false;
        this.generations[index]++;
        this.free.push(index);

        return true;
    }

    isAlive(entity: Entity): boolean {
        const index = entityIndex(entity);

        return this.alive[index] === true && this.generations[index] === entityGeneration(entity);
    }
}
