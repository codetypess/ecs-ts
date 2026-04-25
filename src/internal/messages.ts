import { MessageReader, Messages } from "../message.js";
import type { MessageId, MessageReaderOptions, MessageType } from "../message.js";

/** Indexed storage for every registered message channel. */
export interface MessageContext {
    readonly messageStores: (Messages<unknown> | undefined)[];
    readonly registeredStores: Messages<unknown>[];
}

/** Creates the message context used by a world. */
export function createMessageContext(): MessageContext {
    return {
        messageStores: [],
        registeredStores: [],
    };
}

/** Ensures a message channel exists before the first write. */
export function addMessageType<T>(context: MessageContext, type: MessageType<T>): void {
    ensureMessageStore(context, type);
}

/** Creates a world-bound message reader for the channel. */
export function createMessageReader<T>(
    context: MessageContext,
    type: MessageType<T>,
    options: MessageReaderOptions = {}
): MessageReader<T> {
    return new MessageReader(
        type,
        {
            read: (reader) => readMessages(context, reader),
        },
        options
    );
}

/** Writes a message into the current-frame buffer for the given channel. */
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

/** Reads unread messages for the given reader. */
export function readMessages<T>(context: MessageContext, reader: MessageReader<T>): readonly T[] {
    const messages = context.messageStores[reader.type.id] as Messages<T> | undefined;

    return messages?.read(reader) ?? [];
}

/** Returns and clears all buffered messages for the channel. */
export function drainMessages<T>(context: MessageContext, type: MessageType<T>): T[] {
    const messages = context.messageStores[type.id] as Messages<T> | undefined;

    return messages?.drain() ?? [];
}

/** Clears all buffered messages for the channel. */
export function clearMessages<T>(context: MessageContext, type: MessageType<T>): void {
    (context.messageStores[type.id] as Messages<T> | undefined)?.clear();
}

/** Rotates every message buffer once per frame. */
export function updateMessages(context: MessageContext): void {
    for (const messages of context.registeredStores) {
        messages.update();
    }
}

function ensureMessageStore<T>(context: MessageContext, type: MessageType<T>): Messages<T> {
    const existing = context.messageStores[type.id] as Messages<T> | undefined;

    if (existing !== undefined) {
        return existing;
    }

    const created = new Messages<unknown>();
    context.messageStores[type.id] = created;
    context.registeredStores.push(created);

    return created as unknown as Messages<T>;
}
