import { Messages } from "../message";
import type { MessageId, MessageReader, MessageType } from "../message";

export interface MessageContext {
    readonly messageStores: (Messages<unknown> | undefined)[];
}

export function createMessageContext(): MessageContext {
    return {
        messageStores: [],
    };
}

export function addMessageType<T>(context: MessageContext, type: MessageType<T>): void {
    ensureMessageStore(context, type);
}

export function writeMessage<T>(
    context: MessageContext,
    type: MessageType<T>,
    value: T
): MessageId<T> {
    const existing = context.messageStores[type.id] as Messages<T> | undefined;

    if (existing !== undefined) {
        return existing.write(value);
    }

    return ensureMessageStore(context, type).write(value);
}

export function readMessages<T>(
    context: MessageContext,
    reader: MessageReader<T>
): readonly T[] {
    const messages = context.messageStores[reader.type.id] as Messages<T> | undefined;

    return messages?.read(reader) ?? [];
}

export function drainMessages<T>(context: MessageContext, type: MessageType<T>): T[] {
    const messages = context.messageStores[type.id] as Messages<T> | undefined;

    return messages?.drain() ?? [];
}

export function clearMessages<T>(context: MessageContext, type: MessageType<T>): void {
    (context.messageStores[type.id] as Messages<T> | undefined)?.clear();
}

export function updateMessages(context: MessageContext): void {
    for (const messages of context.messageStores) {
        messages?.update();
    }
}

function ensureMessageStore<T>(
    context: MessageContext,
    type: MessageType<T>
): Messages<T> {
    const existing = context.messageStores[type.id];

    if (existing !== undefined) {
        return existing as Messages<T>;
    }

    const messages = new Messages<T>();
    context.messageStores[type.id] = messages as Messages<unknown>;

    return messages;
}
