export interface ContentPacket<TMetadata extends object = Record<string, unknown>> {
  platform: string;
  title: string;
  speaker?: string;
  timestamp: string;
  text: string;
  metadata: TMetadata;
}
