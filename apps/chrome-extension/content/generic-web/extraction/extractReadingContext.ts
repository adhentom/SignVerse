import type { WebsiteContent } from '../../../shared/websiteContent';
import type { WebsiteReadingContext } from '../../adapters/PlatformAdapter';
import {
  describeDomSelector,
  findPrimaryReadableRegion,
  inspectReadableCandidate,
  readableBlocks,
  READABLE_BLOCK_SELECTOR,
  type ReadableCandidate,
  type ReadableRegion,
} from './readableRegion';

const MAX_CONTEXT_LENGTH = 5_000;

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function elementForNode(node: Node | null | undefined): HTMLElement | null {
  if (node instanceof HTMLElement) return node;
  return node?.parentElement ?? null;
}

function caretNodeAtPoint(
  document: Document,
  point: WebsiteReadingContext['point'],
): Node | null {
  if (!point) return null;
  if (typeof document.caretPositionFromPoint === 'function') {
    return document.caretPositionFromPoint(point.x, point.y)?.offsetNode ?? null;
  }
  const legacyDocument = document as Document & {
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  return legacyDocument.caretRangeFromPoint?.(point.x, point.y)?.startContainer ?? null;
}

function blockForElement(element: HTMLElement | null): HTMLElement | null {
  return element?.closest<HTMLElement>(READABLE_BLOCK_SELECTOR) ?? null;
}

function logRejected(candidate: ReadableCandidate): void {
  console.debug('[SignVerse] reading_context_candidate_rejected', {
    selector: describeDomSelector(candidate.element),
    reason: candidate.rejection,
    text: candidate.text,
    characters: candidate.characterCount,
    words: candidate.wordCount,
  });
}

function validCandidates(region: ReadableRegion, diagnostics: boolean): ReadableCandidate[] {
  const candidates = readableBlocks(region.element).map((element) => (
    inspectReadableCandidate(element, region.element)
  ));
  if (diagnostics) {
    candidates.filter(({ rejection }) => rejection).forEach(logRejected);
  }
  return candidates.filter(({ rejection }) => !rejection);
}

function nearestByPosition(
  candidates: ReadableCandidate[],
  point: WebsiteReadingContext['point'],
): ReadableCandidate | null {
  if (!point || candidates.length === 0) return candidates[0] ?? null;
  return candidates.reduce((nearest, candidate) => {
    const rect = candidate.element.getBoundingClientRect();
    const nearestRect = nearest.element.getBoundingClientRect();
    const distance = Math.hypot(
      point.x - (rect.left + rect.width / 2),
      point.y - (rect.top + rect.height / 2),
    );
    const nearestDistance = Math.hypot(
      point.x - (nearestRect.left + nearestRect.width / 2),
      point.y - (nearestRect.top + nearestRect.height / 2),
    );
    return distance < nearestDistance ? candidate : nearest;
  });
}

function nextValidCandidate(
  candidateElement: HTMLElement | null,
  allElements: HTMLElement[],
  valid: ReadableCandidate[],
): ReadableCandidate | null {
  if (!candidateElement) return null;
  const direct = valid.find(({ element }) => element === candidateElement);
  if (direct) return direct;

  const candidateIndex = allElements.indexOf(candidateElement);
  if (candidateIndex < 0) return null;
  return valid.find(({ element }) => allElements.indexOf(element) > candidateIndex)
    ?? [...valid].reverse().find(({ element }) => allElements.indexOf(element) < candidateIndex)
    ?? null;
}

function resolveCandidate(
  context: WebsiteReadingContext,
  region: ReadableRegion,
  diagnostics: boolean,
): ReadableCandidate | null {
  const allElements = readableBlocks(region.element);
  const valid = validCandidates(region, diagnostics);
  if (valid.length === 0) return null;

  const selection = context.document.getSelection();
  const collapsedCaret = selection?.isCollapsed ? elementForNode(selection.focusNode) : null;
  const selectedAnchor = selection && !selection.isCollapsed
    ? elementForNode(selection.focusNode)
    : null;
  const target = selectedAnchor
    ?? elementForNode(context.anchor)
    ?? collapsedCaret
    ?? elementForNode(caretNodeAtPoint(context.document, context.point));
  const targetBlock = blockForElement(target);

  if (targetBlock && !region.element.contains(targetBlock) && diagnostics) {
    const rejected = inspectReadableCandidate(targetBlock, region.element);
    logRejected(rejected);
  }
  if (targetBlock && region.element.contains(targetBlock)) {
    return nextValidCandidate(targetBlock, allElements, valid);
  }

  return nearestByPosition(valid, context.point);
}

function trimContext(value: string): { text: string; truncated: boolean } {
  const normalized = normalizeText(value);
  if (normalized.length <= MAX_CONTEXT_LENGTH) return { text: normalized, truncated: false };
  const candidate = normalized.slice(0, MAX_CONTEXT_LENGTH + 1);
  const boundary = candidate.lastIndexOf(' ');
  return {
    text: candidate.slice(0, boundary > MAX_CONTEXT_LENGTH * 0.8 ? boundary : MAX_CONTEXT_LENGTH),
    truncated: true,
  };
}

function baseContent(document: Document): Pick<WebsiteContent, 'pageTitle' | 'pageUrl'> {
  return {
    pageTitle: document.title.trim() || 'Untitled page',
    pageUrl: document.URL,
  };
}

function selectionContent(
  context: WebsiteReadingContext,
  region: ReadableRegion,
): WebsiteContent | null {
  const selection = context.document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const anchor = elementForNode(selection.anchorNode);
  const block = blockForElement(anchor);
  if (!anchor || !block) return null;

  if (!region.element.contains(anchor)) {
    logRejected(inspectReadableCandidate(block, region.element));
    return null;
  }

  const { text, truncated } = trimContext(selection.toString());
  const wordCount = text ? text.split(/\s+/u).length : 0;
  if (wordCount < 8 || text.length < 60) {
    logRejected({
      element: block,
      text,
      wordCount,
      characterCount: text.length,
      rejection: 'below-minimum-length',
    });
    return null;
  }

  console.debug('[SignVerse] reading_context_selected', {
    selector: describeDomSelector(block), source: 'selection', text,
  });
  return {
    ...baseContent(context.document),
    headings: [],
    paragraphs: [text],
    readingContext: { source: 'selection', tagName: block.tagName.toLowerCase(), truncated },
  };
}

export function resolveReadingBlock(context: WebsiteReadingContext): HTMLElement | null {
  const region = findPrimaryReadableRegion(context.document);
  return region ? resolveCandidate(context, region, false)?.element ?? null : null;
}

export function extractReadingContext(context: WebsiteReadingContext): WebsiteContent {
  const region = findPrimaryReadableRegion(context.document);
  if (!region) {
    console.debug('[SignVerse] reading_context_unavailable', { reason: 'no-readable-main-region' });
    return { ...baseContent(context.document), headings: [], paragraphs: [] };
  }

  console.debug('[SignVerse] reading_context_container_selected', {
    selector: describeDomSelector(region.element), score: Math.round(region.score),
  });
  const selected = selectionContent(context, region);
  if (selected) return selected;

  const candidate = resolveCandidate(context, region, true);
  if (!candidate) {
    console.debug('[SignVerse] reading_context_unavailable', {
      reason: 'no-valid-readable-block',
      container: describeDomSelector(region.element),
    });
    return { ...baseContent(context.document), headings: [], paragraphs: [] };
  }

  const { text, truncated } = trimContext(candidate.text);
  const block = candidate.element;
  const headingLevel = /^H[1-6]$/u.test(block.tagName)
    ? Number.parseInt(block.tagName.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6
    : null;
  const source = context.anchor
    ? 'pointer'
    : context.document.getSelection()?.focusNode
      ? 'caret'
      : 'viewport';

  console.debug('[SignVerse] reading_context_selected', {
    selector: describeDomSelector(block), source, text,
  });
  return {
    ...baseContent(context.document),
    headings: headingLevel ? [{ level: headingLevel, text }] : [],
    paragraphs: headingLevel ? [] : [text],
    readingContext: { source, tagName: block.tagName.toLowerCase(), truncated },
  };
}
