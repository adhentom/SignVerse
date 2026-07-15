export interface ContentPacket<TMetadata extends object = Record<string, unknown>> {
  platform: string;
  title: string;
  timestamp: string;
  text: string;
  metadata: TMetadata;
}
