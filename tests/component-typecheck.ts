import { defineComponent } from "../src";

defineComponent("ComponentTypecheckDefaultMarker");
defineComponent<{ value: number }>("ComponentTypecheckValue");

// @ts-expect-error component values cannot be null
defineComponent<null>("ComponentTypecheckInvalidNull");

// @ts-expect-error component values cannot include undefined
defineComponent<string | undefined>("ComponentTypecheckInvalid");
