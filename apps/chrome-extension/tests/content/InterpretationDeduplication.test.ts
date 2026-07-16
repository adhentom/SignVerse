import { describe, expect, it } from 'vitest';
import { contentPacketIdentity } from '../../content/interpretation/useInterpretation';

describe('interpretation request identity', () => {
  it('ignores timestamp-only caption updates', () => {
    const packet = {
      platform: 'youtube',
      title: 'Demo',
      timestamp: '00:01',
      text: 'The same active caption',
      metadata: { videoId: 'video-1', playbackState: 'playing' },
    };

    expect(contentPacketIdentity({ ...packet, timestamp: '00:02' }))
      .toBe(contentPacketIdentity(packet));
  });

  it('changes when caption text, speaker, or source changes', () => {
    const packet = {
      platform: 'google-meet',
      title: 'Demo meeting',
      speaker: 'Asha',
      timestamp: '10:00:00',
      text: 'Welcome',
      metadata: { meetingId: 'meeting-1' },
    };

    expect(contentPacketIdentity({ ...packet, text: 'Thank you' }))
      .not.toBe(contentPacketIdentity(packet));
    expect(contentPacketIdentity({ ...packet, speaker: 'Ravi' }))
      .not.toBe(contentPacketIdentity(packet));
    expect(contentPacketIdentity({ ...packet, metadata: { meetingId: 'meeting-2' } }))
      .not.toBe(contentPacketIdentity(packet));
  });
});
