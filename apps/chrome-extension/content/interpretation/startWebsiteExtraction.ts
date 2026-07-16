import type { PlatformAdapter } from '../adapters/PlatformAdapter';
import type { ContentPacket } from '../../shared/contentPacket';
import type { WebsiteContent } from '../../shared/websiteContent';
import { websiteContentToPacket } from './websiteContentPacket';

interface WebsiteExtractionResult {
  content: WebsiteContent;
  packet: ContentPacket | null;
}

export function startWebsiteExtraction(
  adapter: PlatformAdapter,
  onResult: (result: WebsiteExtractionResult) => void,
  onError: (error: unknown) => void,
  context: Pick<Window, 'setTimeout' | 'clearTimeout'> & {
    document: Document;
    MutationObserver: typeof MutationObserver;
  } = {
    document,
    MutationObserver,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  },
): () => void {
  let stopped = false;
  let timer = 0;
  let observer: MutationObserver | undefined;

  const extract = () => {
    timer = 0;
    if (stopped) return;
    try {
      console.info('[SignVerse] website_extraction_started', { url: context.document.URL });
      const content = adapter.extractContent(context.document);
      const packet = websiteContentToPacket(content);
      console.info('[SignVerse] website_extraction_completed', {
        headings: content.headings.length,
        paragraphs: content.paragraphs.length,
        packetReady: Boolean(packet),
      });
      onResult({ content, packet });
    } catch (error) {
      console.warn('[SignVerse] website_extraction_failed', error);
      onError(error);
    }
  };

  const schedule = () => {
    if (timer) return;
    timer = context.setTimeout(extract, 100);
  };

  observer = new context.MutationObserver(schedule);
  if (context.document.body) {
    observer.observe(context.document.body, { childList: true, subtree: true, characterData: true });
  }
  timer = context.setTimeout(extract, 0);

  return () => {
    stopped = true;
    context.clearTimeout(timer);
    observer?.disconnect();
  };
}
