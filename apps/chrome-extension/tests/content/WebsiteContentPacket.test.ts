import { describe, expect, it } from 'vitest';
import { websiteContentToPacket } from '../../content/interpretation/websiteContentPacket';

describe('websiteContentToPacket', () => {
  it('normalizes visible website content into the shared packet contract', () => {
    expect(websiteContentToPacket({
      pageTitle: 'Example page',
      pageUrl: 'https://example.test/article',
      headings: [{ level: 1, text: 'Accessible heading' }],
      paragraphs: ['Visible paragraph.'],
    }, '2026-07-15T10:20:30.000Z')).toEqual({
      platform: 'website',
      title: 'Example page',
      timestamp: '2026-07-15T10:20:30.000Z',
      text: 'H1: Accessible heading\n\nVisible paragraph.',
      metadata: {
        pageUrl: 'https://example.test/article',
        headingCount: 1,
        paragraphCount: 1,
        truncated: false,
      },
    });
  });

  it('does not send an empty website packet', () => {
    expect(websiteContentToPacket({
      pageTitle: 'Empty page',
      pageUrl: 'https://example.test',
      headings: [],
      paragraphs: [],
    })).toBeNull();
  });
});
