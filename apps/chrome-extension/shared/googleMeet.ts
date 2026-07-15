import type { LiveContentSnapshot } from './liveContent';

export type GoogleMeetConnectionState =
  | 'connected'
  | 'interrupted'
  | 'reconnecting'
  | 'not-in-session';

export interface GoogleMeetPacketMetadata {
  [key: string]: unknown;
  meetingId: string;
  language: string;
  captionsEnabled: boolean;
  participantCount: number | null;
  connectionState: GoogleMeetConnectionState;
}

export type GoogleMeetLiveSnapshot = LiveContentSnapshot<GoogleMeetPacketMetadata>;
