export interface ContentPacket<TMetadata extends object = Record<string, unknown>> {
  platform: string;
  title: string;
  speaker?: string;
  timestamp: string;
  text: string;
  metadata: TMetadata;
}

export function isContentPacket(value: unknown): value is ContentPacket {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ContentPacket>;
  return (
    typeof candidate.platform === 'string' && candidate.platform.trim().length > 0 &&
    typeof candidate.title === 'string' && candidate.title.trim().length > 0 &&
    (candidate.speaker === undefined || typeof candidate.speaker === 'string') &&
    typeof candidate.timestamp === 'string' && candidate.timestamp.trim().length > 0 &&
    typeof candidate.text === 'string' && candidate.text.trim().length > 0 &&
    Boolean(candidate.metadata) && typeof candidate.metadata === 'object' &&
    !Array.isArray(candidate.metadata)
  );
}
