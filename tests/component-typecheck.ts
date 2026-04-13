import { defineComponent } from "../src";

defineComponent("ComponentTypecheckDefaultMarker");
defineComponent<null>("ComponentTypecheckMarker");
defineComponent<{ value: number }>("ComponentTypecheckValue");

// @ts-expect-error component values cannot include undefined
defineComponent<string | undefined>("ComponentTypecheckInvalid");
