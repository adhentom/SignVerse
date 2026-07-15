export const MESSAGE_SCHEMA_VERSION = 1 as const;

export type ExtensionMessage =
  | {
      schemaVersion: typeof MESSAGE_SCHEMA_VERSION;
      type: 'SIGNVERSE_GET_STATUS';
      correlationId: string;
    }
  | {
      schemaVersion: typeof MESSAGE_SCHEMA_VERSION;
      type: 'SIGNVERSE_TOGGLE_MOCK';
      correlationId: string;
    };

export interface ContentStatus {
  enabled: boolean;
  pageTitle: string;
  mockText: string;
}

export type ExtensionResponse =
  | {
      ok: true;
      correlationId: string;
      data: ContentStatus;
    }
  | {
      ok: false;
      correlationId: string;
      error: string;
    };

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ExtensionMessage>;
  return (
    candidate.schemaVersion === MESSAGE_SCHEMA_VERSION &&
    typeof candidate.correlationId === 'string' &&
    (candidate.type === 'SIGNVERSE_GET_STATUS' ||
      candidate.type === 'SIGNVERSE_TOGGLE_MOCK')
  );
}

export function createMessage(
  type: ExtensionMessage['type'],
): ExtensionMessage {
  return {
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    type,
    correlationId: crypto.randomUUID(),
  };
}
