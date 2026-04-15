import { Messages } from "../message";
import type { MessageId, MessageReader, MessageType } from "../message";

interface MessageRuntimeOptions {
    readonly messageStores: (Messages<unknown> | undefined)[];
}

export class MessageRuntime {
    constructor(private readonly options: MessageRuntimeOptions) {}

    add<T>(type: MessageType<T>): void {
        this.ensure(type);
    }

    write<T>(type: MessageType<T>, value: T): MessageId<T> {
        const existing = this.options.messageStores[type.id] as Messages<T> | undefined;

        if (existing !== undefined) {
            return existing.write(value);
        }

        return this.ensure(type).write(value);
    }

    read<T>(reader: MessageReader<T>): readonly T[] {
        const messages = this.options.messageStores[reader.type.id] as Messages<T> | undefined;

        return messages?.read(reader) ?? [];
    }

    drain<T>(type: MessageType<T>): T[] {
        const messages = this.options.messageStores[type.id] as Messages<T> | undefined;

        return messages?.drain() ?? [];
    }

    clear<T>(type: MessageType<T>): void {
        (this.options.messageStores[type.id] as Messages<T> | undefined)?.clear();
    }

    update(): void {
        for (const messages of this.options.messageStores) {
            messages?.update();
        }
    }

    private ensure<T>(type: MessageType<T>): Messages<T> {
        const existing = this.options.messageStores[type.id];

        if (existing !== undefined) {
            return existing as Messages<T>;
        }

        const messages = new Messages<T>();
        this.options.messageStores[type.id] = messages as Messages<unknown>;

        return messages;
    }
}
