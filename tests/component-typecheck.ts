import {
    World,
    createRegistry,
    requireComponent,
    withComponent,
    withMarker,
    type ComponentData,
    type ComponentDataWithTemplate,
} from "../src";

const registry = createRegistry("component-typecheck");

function expectType<T>(value: T): void {
    void value;
}

const Marker = registry.defineComponent("ComponentTypecheckDefaultMarker");
const RequiredValue = registry.defineComponent<number>("ComponentTypecheckRequiredValue");
const MarkerWithRequired = registry.defineComponent("ComponentTypecheckMarkerWithRequired", {
    require: [requireComponent(RequiredValue, () => 1)],
});
const Value = registry.defineComponent<{ value: number }>("ComponentTypecheckValue");
const Transform = registry.defineComponent<{ x: number; y: number }>("ComponentTypecheckTransform");
const SlgTransform = registry.defineComponent<{ start: number; speed: number }, typeof Transform>(
    "ComponentTypecheckSlgTransform"
);
const SlgTransformWithLifecycle = registry.defineComponent<
    { start: number; speed: number },
    typeof Transform
>("ComponentTypecheckSlgTransformWithLifecycle", {
    onAdd(_entity, transform) {
        expectType<number>(transform.x);
        expectType<number>(transform.y);
        expectType<number>(transform.start);
        expectType<number>(transform.speed);
    },
});

expectType<Record<string, never>>({} satisfies ComponentData<typeof Marker>);
expectType<Record<string, never>>({} satisfies ComponentData<typeof MarkerWithRequired>);
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
withMarker(MarkerWithRequired);
withComponent(Value, { value: 1 });
withComponent(Transform, { x: 0, y: 0 });
withComponent(SlgTransform, { x: 0, y: 0, start: 0, speed: 1 });
withComponent(SlgTransformWithLifecycle, { x: 0, y: 0, start: 0, speed: 1 });

// @ts-expect-error required component options are not marker payload data
expectType<ComponentData<typeof MarkerWithRequired>>({ require: [] });

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

// @ts-expect-error primitive components cannot be used as object payload templates
registry.defineComponent<{ enabled: boolean }, typeof RequiredValue>(
    "ComponentTypecheckInvalidTemplate"
);

// @ts-expect-error value components are not markers
withMarker(Value);

const world = new World(registry);
const entity = world.spawn(withMarker(Marker), withComponent(Value, { value: 1 }));

for (const [matched, marker, value] of world.query(Marker, Value)) {
    expectType<number>(matched);
    expectType<Record<string, never>>(marker);
    expectType<{ value: number }>(value);
}

expectType<readonly [Record<string, never>, { value: number }] | undefined>(
    world.getMany(entity, Marker, Value)
);

// @ts-expect-error component values cannot be null
registry.defineComponent<null>("ComponentTypecheckInvalidNull");

// @ts-expect-error component values cannot include undefined
registry.defineComponent<string | undefined>("ComponentTypecheckInvalid");
