import { describe, expect, it } from 'vitest';
import { segmentIdentity } from '../../content/interpretation/useStreamingInterpretation';

describe('interpretation request identity', () => {
  it('ignores timestamp-only caption updates', () => {
    const packet = {
      platform: 'youtube',
      title: 'Demo',
      timestamp: '00:01',
      text: 'The same active caption',
      metadata: { videoId: 'video-1', playbackState: 'playing' },
    };

    expect(segmentIdentity({ ...packet, timestamp: '00:02' }))
      .toBe(segmentIdentity(packet));
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

    expect(segmentIdentity({ ...packet, text: 'Thank you' }))
      .not.toBe(segmentIdentity(packet));
    expect(segmentIdentity({ ...packet, speaker: 'Ravi' }))
      .not.toBe(segmentIdentity(packet));
    expect(segmentIdentity({ ...packet, metadata: { meetingId: 'meeting-2' } }))
      .not.toBe(segmentIdentity(packet));
  });
});
