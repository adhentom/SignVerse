import type { ContentPacket } from '../../shared/contentPacket';
import type { WebsiteContent } from '../../shared/websiteContent';

const MAX_CONTENT_LENGTH = 50_000;

export function websiteContentToPacket(
  content: WebsiteContent,
  timestamp = new Date().toISOString(),
): ContentPacket | null {
  const sections = [
    ...content.headings.map((heading) => `H${heading.level}: ${heading.text}`),
    ...content.paragraphs,
  ];
  const text = sections.join('\n\n').trim().slice(0, MAX_CONTENT_LENGTH);

  if (!text) {
    return null;
  }

  return {
    platform: 'website',
    title: content.pageTitle.slice(0, 500),
    timestamp,
    text,
    metadata: {
      pageUrl: content.pageUrl,
      headingCount: content.headings.length,
      paragraphCount: content.paragraphs.length,
      truncated: sections.join('\n\n').trim().length > MAX_CONTENT_LENGTH,
    },
  };
}
