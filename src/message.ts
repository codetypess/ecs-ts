let nextMessageTypeId = 0;

declare const MessageTypeBrand: unique symbol;
declare const MessageIdBrand: unique symbol;

export type MessageId<T> = number & { readonly [MessageIdBrand]: T };

export interface MessageType<T> {
    readonly id: number;
    readonly name: string;
    readonly [MessageTypeBrand]?: T;
}

export type AnyMessageType = MessageType<unknown>;

export type MessageData<TMessage extends AnyMessageType> =
    TMessage extends MessageType<infer TData> ? TData : never;

export interface MessageEntry<T> {
    readonly id: MessageId<T>;
    readonly value: T;
}

export interface MessageWorld {
    readMessages<T>(reader: MessageReader<T>): readonly T[];
}

export interface MessageReaderOptions {
    readonly startAt?: number;
}

export class MessageReader<T> {
    private nextMessageId: number;

    constructor(
        readonly type: MessageType<T>,
        options: MessageReaderOptions = {}
    ) {
        this.nextMessageId = options.startAt ?? 0;
    }

    get cursor(): number {
        return this.nextMessageId;
    }

    read(world: MessageWorld): readonly T[] {
        return world.readMessages(this);
    }

    advanceTo(nextMessageId: number): void {
        this.nextMessageId = nextMessageId;
    }
}

export class Messages<T> {
    private readonly buffers: [MessageEntry<T>[], MessageEntry<T>[]] = [[], []];
    private currentBuffer: 0 | 1 = 0;
    private nextMessageId = 0;

    get nextId(): number {
        return this.nextMessageId;
    }

    get length(): number {
        return this.buffers[0].length + this.buffers[1].length;
    }

    write(value: T): MessageId<T> {
        const id = this.nextMessageId as MessageId<T>;
        this.nextMessageId++;
        this.buffers[this.currentBuffer].push({ id, value });

        return id;
    }

    read(reader: MessageReader<T>): readonly T[] {
        const values: T[] = [];
        const cursor = reader.cursor;

        this.collectUnread(this.previousBuffer(), cursor, values);
        this.collectUnread(this.currentBuffer, cursor, values);
        reader.advanceTo(this.nextMessageId);

        return values;
    }

    update(): void {
        this.currentBuffer = this.previousBuffer();
        this.buffers[this.currentBuffer].length = 0;
    }

    clear(): void {
        this.buffers[0].length = 0;
        this.buffers[1].length = 0;
    }

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

export function defineMessage<T>(name: string): MessageType<T> {
    return Object.freeze({
        id: nextMessageTypeId++,
        name,
    });
}

export function messageReader<T>(type: MessageType<T>): MessageReader<T> {
    return new MessageReader(type);
}
