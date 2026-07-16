import type { InterpretationResponse } from '../../shared/interpretation';
import type { LiveContentSnapshot } from '../../shared/liveContent';
import type { PlatformInfo } from '../../shared/platform';
import type { WebsiteContentState } from '../../shared/websiteContent';

const CAPTIONS = {
  youtube: 'Digital accessibility helps every learner participate with confidence.',
  'google-meet': 'Welcome everyone. Today we are demonstrating accessible communication.',
} as const;

export const DEMO_WEBSITE_CONTENT: WebsiteContentState = {
  status: 'ready',
  content: {
    pageTitle: 'SignVerse Accessibility Demo',
    pageUrl: 'signverse://offline-demo',
    headings: [{ level: 1, text: 'Inclusive digital experiences' }],
    paragraphs: ['SignVerse makes website content easier to understand through Malayalam translation and Indian Sign Language playback.'],
  },
};

export const DEMO_INTERPRETATION: InterpretationResponse = {
  summary: 'SignVerse demonstrates an accessible interpretation of digital content entirely on this device.',
  malayalam_translation: 'ഡിജിറ്റൽ ഉള്ളടക്കം എല്ലാവർക്കും ലഭ്യമാക്കാൻ സൈൻവേഴ്സ് സഹായിക്കുന്നു.',
  key_points: ['Accessible digital content', 'Offline demonstration playback'],
  keywords: ['accessibility', 'SignVerse', 'Indian Sign Language'],
  glossary: ['Accessibility: digital experiences designed for people of all abilities'],
  isl_gloss: ['WELCOME', 'ACCESSIBILITY', 'THANK-YOU'],
  confidence: 0.96,
  playback: {
    items: [
      { token_id: 'demo-welcome', asset_id: 'asset-demo-welcome', duration: 1.2, confidence: 0.98 },
      { token_id: 'demo-accessibility', asset_id: 'asset-demo-accessibility', duration: 1.2, confidence: 0.94 },
      { token_id: 'demo-thank-you', asset_id: 'asset-demo-thank-you', duration: 1.2, confidence: 0.97 },
    ],
    unsupported_tokens: [],
  },
};

export function createDemoLiveSnapshot(platform: PlatformInfo): LiveContentSnapshot | null {
  if (platform.id !== 'youtube' && platform.id !== 'google-meet') return null;
  const text = CAPTIONS[platform.id];
  const metadata = platform.id === 'youtube'
    ? { channel: 'SignVerse Demo', language: 'en-IN', videoId: 'offline-demo', captionsEnabled: true, isAdvertisement: false, isLive: false, playbackState: 'playing', demo: true }
    : { meetingId: 'offline-demo', language: 'en-IN', captionsEnabled: true, participantCount: 3, connectionState: 'connected', demo: true };
  const packet = {
    platform: platform.id,
    title: platform.id === 'youtube' ? 'SignVerse Accessibility Demo' : 'SignVerse Demo Meeting',
    ...(platform.id === 'google-meet' ? { speaker: 'Demo Speaker' } : {}),
    timestamp: '00:12',
    text,
    metadata,
  };
  return {
    status: platform.id === 'youtube' ? 'playing' : 'connected',
    statusMessage: 'Offline demo captions',
    title: packet.title,
    timestamp: packet.timestamp,
    metadata,
    currentPacket: packet,
    history: [packet],
  };
}
