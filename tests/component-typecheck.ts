import {
    World,
    createRegistry,
    requireComponent,
    withComponent,
    withMarker,
    type ComponentData,
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

expectType<Record<string, never>>({} satisfies ComponentData<typeof Marker>);
expectType<Record<string, never>>({} satisfies ComponentData<typeof MarkerWithRequired>);
withMarker(Marker);
withMarker(MarkerWithRequired);
withComponent(Value, { value: 1 });

// @ts-expect-error required component options are not marker payload data
expectType<ComponentData<typeof MarkerWithRequired>>({ require: [] });

// @ts-expect-error marker component payloads cannot be null
withComponent(Marker, null);

// @ts-expect-error marker component payloads cannot be undefined
withComponent(Marker, undefined);

// @ts-expect-error value component payloads must match their component data
withComponent(Value, {});

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
