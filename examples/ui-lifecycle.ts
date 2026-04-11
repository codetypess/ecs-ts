import { Commands, Entity, World, defineComponent, defineResource, withComponent } from "../src";

interface UiHandle {
    readonly id: number;
    readonly key: string;
    destroyed: boolean;
}

interface UiSourceData {
    readonly key: string;
    readonly props?: unknown;
    readonly delayMs?: number;
}

interface UiLoadingData {
    readonly requestId: number;
    readonly abort: AbortController;
}

interface UiInstanceData {
    readonly handle: UiHandle;
    readonly requestId: number;
}

interface UiLoadResult {
    readonly entity: Entity;
    readonly requestId: number;
    readonly handle: UiHandle;
}

interface UiLoadFailure {
    readonly entity: Entity;
    readonly requestId: number;
    readonly error: unknown;
}

class UiRuntime {
    readonly completed: UiLoadResult[] = [];
    readonly failed: UiLoadFailure[] = [];

    private nextHandleId = 1;
    private nextRequest = 1;

    nextRequestId(): number {
        return this.nextRequest++;
    }

    load(
        key: string,
        options: {
            readonly props?: unknown;
            readonly signal: AbortSignal;
            readonly delayMs?: number;
        }
    ): Promise<UiHandle> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                resolve({
                    id: this.nextHandleId++,
                    key,
                    destroyed: false,
                });
            }, options.delayMs ?? 16);

            options.signal.addEventListener(
                "abort",
                () => {
                    clearTimeout(timeout);
                    reject(new DOMException(`UI load aborted: ${key}`, "AbortError"));
                },
                { once: true }
            );
        });
    }

    destroy(handle: UiHandle): void {
        if (handle.destroyed) {
            return;
        }

        handle.destroyed = true;
        console.log(`destroy ui handle #${handle.id} (${handle.key})`);
    }
}

const UiRuntimeResource = defineResource<UiRuntime>("UiRuntime");

const UiSource = defineComponent<UiSourceData>("UiSource");
const UiLoading = defineComponent<UiLoadingData>("UiLoading", {
    onRemove(_entity, loading) {
        loading.abort.abort();
    },
});
const UiInstance = defineComponent<UiInstanceData>("UiInstance", {
    onRemove(_entity, instance, world) {
        world.resource(UiRuntimeResource).destroy(instance.handle);
    },
});

class UiSystem {
    onStartup(world: World): void {
        world.setResource(UiRuntimeResource, new UiRuntime());
    }

    onUpdate(world: World, _dt: number, commands: Commands): void {
        const ui = world.resource(UiRuntimeResource);

        world.eachWhere([UiSource], { without: [UiLoading, UiInstance] }, (entity, source) => {
            const abort = new AbortController();
            const requestId = ui.nextRequestId();

            commands.add(entity, UiLoading, { requestId, abort });

            ui.load(source.key, {
                props: source.props,
                signal: abort.signal,
                delayMs: source.delayMs,
            }).then(
                (handle) => {
                    ui.completed.push({ entity, requestId, handle });
                },
                (error) => {
                    ui.failed.push({ entity, requestId, error });
                }
            );
        });
    }

    onPostUpdate(world: World, _dt: number, commands: Commands): void {
        const ui = world.resource(UiRuntimeResource);

        for (const result of drain(ui.completed)) {
            const loading = world.get(result.entity, UiLoading);

            if (!world.isAlive(result.entity) || loading?.requestId !== result.requestId) {
                ui.destroy(result.handle);
                continue;
            }

            commands.remove(result.entity, UiLoading);
            commands.add(result.entity, UiInstance, {
                handle: result.handle,
                requestId: result.requestId,
            });
        }

        for (const failure of drain(ui.failed)) {
            const loading = world.get(failure.entity, UiLoading);

            if (!world.isAlive(failure.entity) || loading?.requestId !== failure.requestId) {
                continue;
            }

            commands.remove(failure.entity, UiLoading);
            console.log(`ui load failed for entity ${failure.entity}`);
        }
    }
}

function installUiLifecycle(world: World): void {
    world.addSystem(new UiSystem());
}

function drain<T>(items: T[]): T[] {
    return items.splice(0, items.length);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
    const world = new World();
    installUiLifecycle(world);

    const mainMenu = world.spawn(
        withComponent(UiSource, {
            key: "MainMenu",
            props: { title: "ECS UI demo" },
            delayMs: 5,
        })
    );

    const inventory = world.spawn(
        withComponent(UiSource, {
            key: "InventoryPanel",
            props: { slots: 24 },
            delayMs: 25,
        })
    );

    world.update(0);

    world.despawn(inventory);

    await sleep(30);
    world.update(0);

    world.despawn(mainMenu);
}

void main();
