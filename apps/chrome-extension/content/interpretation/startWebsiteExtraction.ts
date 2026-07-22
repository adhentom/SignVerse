import type { PlatformAdapter } from '../adapters/PlatformAdapter';
import { supportsLocalizedContent } from '../adapters/PlatformAdapter';
import type { ContentPacket } from '../../shared/contentPacket';
import type { WebsiteContent } from '../../shared/websiteContent';
import { websiteContentToPacket } from './websiteContentPacket';

interface WebsiteExtractionResult {
  content: WebsiteContent;
  packet: ContentPacket | null;
}

export const WEBSITE_CONTEXT_DEBOUNCE_MS = 400;

function resultIdentity(content: WebsiteContent, packet: ContentPacket | null): string {
  return JSON.stringify({
    pageUrl: content.pageUrl,
    text: packet?.text ?? '',
    source: content.readingContext?.source ?? 'legacy',
  });
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
  let anchor: Node | null = null;
  let point: { x: number; y: number } | undefined;
  let lastBlock: HTMLElement | null = null;
  let lastResultIdentity = '';

  const extract = () => {
    timer = 0;
    if (stopped) return;
    try {
      console.info('[SignVerse] website_extraction_started', { url: context.document.URL });
      const content = supportsLocalizedContent(adapter)
        ? adapter.extractReadingContext({ document: context.document, anchor, point })
        : adapter.extractContent(context.document);
      const packet = websiteContentToPacket(content);
      const identity = resultIdentity(content, packet);
      console.info('[SignVerse] website_extraction_completed', {
        headings: content.headings.length,
        paragraphs: content.paragraphs.length,
        packetReady: Boolean(packet),
        readingContext: content.readingContext?.source ?? 'legacy',
        contextTag: content.readingContext?.tagName ?? null,
      });
      if (identity === lastResultIdentity) {
        console.debug('[SignVerse] website_context_unchanged');
        return;
      }
      lastResultIdentity = identity;
      onResult({ content, packet });
    } catch (error) {
      console.warn('[SignVerse] website_extraction_failed', error);
      onError(error);
    }
  };

  const schedule = (delay = WEBSITE_CONTEXT_DEBOUNCE_MS) => {
    context.clearTimeout(timer);
    timer = context.setTimeout(extract, delay);
  };

  const updatePointerContext = (event: PointerEvent | MouseEvent) => {
    const candidate = event.target instanceof Node ? event.target : null;
    if (!candidate || (candidate instanceof Element && candidate.closest('#signverse-ai-widget-host'))) {
      return;
    }
    anchor = candidate;
    point = { x: event.clientX, y: event.clientY };
    if (supportsLocalizedContent(adapter)) {
      const block = adapter.resolveReadingBlock({ document: context.document, anchor, point });
      if (block === lastBlock) {
        console.debug('[SignVerse] website_pointer_same_block');
        return;
      }
      lastBlock = block;
    }
    schedule();
  };

  const updateSelectionContext = () => {
    // Selection extraction reads directly from the document. Clearing pointer state here lets a
    // collapsed selection resolve as a caret context instead of being mislabeled as a pointer.
    anchor = null;
    point = undefined;
    lastBlock = null;
    schedule();
  };

  observer = new context.MutationObserver(() => schedule());
  if (context.document.body) {
    observer.observe(context.document.body, { childList: true, subtree: true, characterData: true });
  }
  timer = context.setTimeout(extract, 0);
  context.document.addEventListener('pointermove', updatePointerContext, { passive: true });
  context.document.addEventListener('click', updatePointerContext, { passive: true });
  context.document.addEventListener('selectionchange', updateSelectionContext);

  return () => {
    stopped = true;
    context.clearTimeout(timer);
    observer?.disconnect();
    context.document.removeEventListener('pointermove', updatePointerContext);
    context.document.removeEventListener('click', updatePointerContext);
    context.document.removeEventListener('selectionchange', updateSelectionContext);
  };
}
