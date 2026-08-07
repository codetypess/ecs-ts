import {
    defineComponent,
    World,
    createRegistry,
    withComponent,
    withMarker,
    type ComponentData,
    type ComponentDataWithTemplate,
} from "../src";

const registry = createRegistry("component-typecheck");

function expectType<T>(value: T): void {
    void value;
}

const Marker = registry.registerComponent(defineComponent("ComponentTypecheckDefaultMarker"));
type Value = { value: number };
const Value = registry.registerComponent(defineComponent<Value>("ComponentTypecheckValue"));
type Transform = { x: number; y: number };
const Transform = registry.registerComponent(
    defineComponent<Transform>("ComponentTypecheckTransform")
);
type SlgTransformFields = { start: number; speed: number };
const SlgTransform = registry.registerComponent(
    defineComponent<SlgTransformFields, typeof Transform>("ComponentTypecheckSlgTransform")
);
type SlgTransformWithLifecycleFields = { start: number; speed: number };
const SlgTransformWithLifecycle = registry.registerComponent(
    defineComponent<SlgTransformWithLifecycleFields, typeof Transform>(
        "ComponentTypecheckSlgTransformWithLifecycle",
        {
            onAdd(_entity, transform, _world, reason) {
                expectType<number>(transform.x);
                expectType<number>(transform.y);
                expectType<number>(transform.start);
                expectType<number>(transform.speed);
                expectType<"added" | "spawned">(reason);
            },
            onUnset(_entity, transform) {
                expectType<number>(transform.x);
                expectType<number>(transform.y);
                expectType<number>(transform.start);
                expectType<number>(transform.speed);
            },
            onReplace(_entity, previous, next) {
                expectType<number>(previous.x);
                expectType<number>(previous.y);
                expectType<number>(previous.start);
                expectType<number>(previous.speed);
                expectType<number>(next.x);
                expectType<number>(next.y);
                expectType<number>(next.start);
                expectType<number>(next.speed);
            },
            onRemove(_entity, transform, _world, reason) {
                expectType<number>(transform.x);
                expectType<"removed" | "despawned">(reason);
            },
        }
    )
);

expectType<Record<string, never>>({} satisfies ComponentData<typeof Marker>);
expectType<{
    x: number;
    y: number;
    start: number;
    speed: number;
}>({ x: 0, y: 0, start: 0, speed: 1 } satisfies ComponentData<typeof SlgTransform>);
expectType<{
    x: number;
    y: number;
    start: number;
    speed: number;
}>({ x: 0, y: 0, start: 0, speed: 1 } satisfies ComponentDataWithTemplate<
    { start: number; speed: number },
    typeof Transform
>);
withMarker(Marker);
withComponent(Value, { value: 1 });
withComponent(Transform, { x: 0, y: 0 });
withComponent(SlgTransform, { x: 0, y: 0, start: 0, speed: 1 });
withComponent(SlgTransformWithLifecycle, { x: 0, y: 0, start: 0, speed: 1 });

// @ts-expect-error marker component payloads cannot be null
withComponent(Marker, null);

// @ts-expect-error marker component payloads cannot be undefined
withComponent(Marker, undefined);

// @ts-expect-error value component payloads must match their component data
withComponent(Value, {});

// @ts-expect-error template payload fields are required
withComponent(SlgTransform, { start: 0, speed: 1 });

// @ts-expect-error own payload fields are required
withComponent(SlgTransform, { x: 0, y: 0 });

// @ts-expect-error component payloads must be objects
registry.registerComponent(defineComponent<number>("ComponentTypecheckInvalidPrimitive"));

// @ts-expect-error value components are not markers
withMarker(Value);

const world = new World(registry);
const entity = world.spawn(0, withMarker(Marker), withComponent(Value, { value: 1 }));

// @ts-expect-error spawn requires an explicit entity type
world.spawn(withMarker(Marker));

// @ts-expect-error deferred spawn requires an explicit entity type
world.commands().spawn(withMarker(Marker));

world.batch((batch) => {
    // @ts-expect-error batch spawn requires an explicit entity type
    batch.spawn(withMarker(Marker));
});

for (const [matched, marker, value] of world.query([Marker, Value])) {
    expectType<number>(matched);
    expectType<Record<string, never>>(marker);
    expectType<Value>(value);
}

expectType<readonly [Record<string, never>, Value] | undefined>(
    world.getManyComponents(entity, Marker, Value)
);
expectType<number | undefined>(world.entityType(entity));

// @ts-expect-error component values cannot be null
registry.registerComponent(defineComponent<null>("ComponentTypecheckInvalidNull"));

// @ts-expect-error component values cannot include undefined
registry.registerComponent(defineComponent<string | undefined>("ComponentTypecheckInvalid"));
