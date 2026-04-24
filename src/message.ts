import type { Registry } from "./registry.js";
import { assertRegisteredType } from "./registry.js";

declare const MessageTypeBrand: unique symbol;
declare const MessageIdBrand: unique symbol;

/** Monotonic id assigned to each written message instance. */
export type MessageId<T> = number & { readonly [MessageIdBrand]: T };

/** Runtime handle for a short-lived message channel. */
export interface MessageType<T> {
    readonly id: number;
    readonly key: string;
    readonly name: string;
    readonly registry: Registry;
    readonly [MessageTypeBrand]?: T;
}

export type AnyMessageType = MessageType<unknown>;

export type MessageData<TMessage extends AnyMessageType> =
    TMessage extends MessageType<infer TData> ? TData : never;

/** Stored message record combining the payload with its channel-local id. */
export interface MessageEntry<T> {
    readonly id: MessageId<T>;
    readonly value: T;
}

/** Minimal world surface needed by message readers. */
export interface MessageWorld {
    readMessages<T>(reader: MessageReader<T>): readonly T[];
}

/** Options for constructing a reader that starts from a custom cursor. */
export interface MessageReaderOptions {
    readonly startAt?: number;
}

/** Cursor-based reader that lets multiple consumers independently read the same messages. */
export class MessageReader<T> {
    private nextMessageId: number;
    /** @internal Reused output buffer; never hold a reference to the returned array across frames. */
    readonly _readBuffer: T[] = [];

    constructor(
        readonly type: MessageType<T>,
        options: MessageReaderOptions = {}
    ) {
        this.nextMessageId = options.startAt ?? 0;
    }

    /** Next message id that will be considered unread by this reader. */
    get cursor(): number {
        return this.nextMessageId;
    }

    /** Reads all unread messages and advances the cursor to the latest id. */
    read(world: MessageWorld): readonly T[] {
        return world.readMessages(this);
    }

    /** Manually rewinds or fast-forwards the reader cursor. */
    advanceTo(nextMessageId: number): void {
        this.nextMessageId = nextMessageId;
    }
}

/** Double-buffered message storage that survives exactly one world update boundary. */
export class Messages<T> {
    private readonly buffers: [MessageEntry<T>[], MessageEntry<T>[]] = [[], []];
    private currentBuffer: 0 | 1 = 0;
    private nextMessageId = 0;

    /** Id that will be assigned to the next written message. */
    get nextId(): number {
        return this.nextMessageId;
    }

    /** Total unread and current-frame messages across both buffers. */
    get length(): number {
        return this.buffers[0].length + this.buffers[1].length;
    }

    /** Appends a message to the current write buffer. */
    write(value: T): MessageId<T> {
        const id = this.nextMessageId as MessageId<T>;
        this.nextMessageId++;
        this.buffers[this.currentBuffer].push({ id, value });

        return id;
    }

    /** Reads unread messages from both buffers and advances the reader cursor. */
    read(reader: MessageReader<T>): readonly T[] {
        const values = reader._readBuffer;
        values.length = 0;
        const cursor = reader.cursor;

        this.collectUnread(this.previousBuffer(), cursor, values);
        this.collectUnread(this.currentBuffer, cursor, values);
        reader.advanceTo(this.nextMessageId);

        return values;
    }

    /** Rotates the active write buffer and clears the now-current one for the next frame. */
    update(): void {
        this.currentBuffer = this.previousBuffer();
        this.buffers[this.currentBuffer].length = 0;
    }

    /** Removes every buffered message without changing the next id counter. */
    clear(): void {
        this.buffers[0].length = 0;
        this.buffers[1].length = 0;
    }

    /** Returns all buffered messages and empties both buffers. */
    drain(): T[] {
        const values: T[] = [];
        const previousBuffer = this.previousBuffer();

        for (const entry of this.buffers[previousBuffer]) {
            values.push(entry.value);
        }

        for (const entry of this.buffers[this.currentBuffer]) {
            values.push(entry.value);
        }

        this.clear();

        return values;
    }

    private collectUnread(bufferIndex: 0 | 1, cursor: number, output: T[]): void {
        for (const entry of this.buffers[bufferIndex]) {
            if (entry.id >= cursor) {
                output.push(entry.value);
            }
        }
    }

    private previousBuffer(): 0 | 1 {
        return this.currentBuffer === 0 ? 1 : 0;
    }
}

/** Creates a cursor-based reader that starts at the current channel origin. */
export function messageReader<T>(type: MessageType<T>): MessageReader<T> {
    return new MessageReader(type);
}

/** Throws unless the message channel belongs to the expected registry. */
export function assertRegisteredMessage(
    registry: Registry,
    type: AnyMessageType,
    action: string
): void {
    assertRegisteredType(registry, type, "message", action);
}
