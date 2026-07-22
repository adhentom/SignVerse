import { isInsideAdvertisement } from './advertisements';
import { getVisibleText, isVisibleElement } from './visibility';

export const MIN_READABLE_CHARACTERS = 60;
export const MIN_READABLE_WORDS = 8;

export const READABLE_BLOCK_SELECTOR = [
  'p',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li',
  'blockquote',
  'figcaption',
  'caption',
  'dt',
  'dd',
  'pre',
  '[role="caption"]',
  '[role="listitem"]',
].join(',');

const MAIN_REGION_SELECTOR = [
  '[itemprop="articleBody"]',
  'article',
  'main',
  '[role="main"]',
  '.mw-parser-output',
  '.article-body',
  '.article__body',
  '.post-content',
  '.entry-content',
  '.story-body',
  '#content',
].join(',');

const INTERFACE_SELECTOR = [
  '#signverse-ai-widget-host',
  '[data-signverse-root]',
  'nav',
  'aside',
  'header',
  'footer',
  'button',
  '[role="button"]',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'dialog',
  'menu',
  '[role="navigation"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
].join(',');

const INTERFACE_IDENTITY = /(^|[-_\s])(nav(?:igation)?|menu|sidebar|side-bar|rail|toolbar|breadcrumb|pagination|footer|header|cookie|consent|banner|popup|popover|modal|overlay|advert(?:isement)?|ads?|sponsor(?:ed)?|promo|related|recommend(?:ed|ations?)?|comment|share|social|account|login|signup|masthead|navbox|toc)([-_\s]|$)/iu;

export type ReadableCandidateRejection =
  | 'outside-main-content'
  | 'navigation-or-interface'
  | 'advertisement'
  | 'hidden'
  | 'empty'
  | 'below-minimum-length';

export interface ReadableCandidate {
  element: HTMLElement;
  text: string;
  wordCount: number;
  characterCount: number;
  rejection?: ReadableCandidateRejection;
}

export interface ReadableRegion {
  element: HTMLElement;
  score: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function identityText(element: Element): string {
  return [
    element.id,
    ...Array.from(element.classList),
    element.getAttribute('role') ?? '',
    element.getAttribute('aria-label') ?? '',
  ].join(' ');
}

function isInterfaceElement(element: Element, boundary?: Element): boolean {
  let current: Element | null = element;
  while (current) {
    // Page-level feature flags commonly mention menus, sidebars, or banners even when the
    // element being inspected is the primary article. Those shell classes describe sibling
    // UI, not the readable subtree, so they must not disqualify every descendant.
    if (current === element.ownerDocument.body || current === element.ownerDocument.documentElement) {
      break;
    }
    if (current.matches(INTERFACE_SELECTOR) || INTERFACE_IDENTITY.test(identityText(current))) {
      return true;
    }
    if (current === boundary) break;
    current = current.parentElement;
  }
  return false;
}

export function describeDomSelector(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && parts.length < 4 && current.tagName.toLowerCase() !== 'html') {
    const tag = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`${tag}#${current.id.replace(/[^a-zA-Z0-9_-]/gu, '')}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    const currentTag = current.tagName;
    const siblings: Element[] = parent
      ? Array.from(parent.children).filter((sibling) => sibling.tagName === currentTag)
      : [];
    const position = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
    parts.unshift(`${tag}${position}`);
    current = parent;
  }
  return parts.join(' > ');
}

export function inspectReadableCandidate(
  element: HTMLElement,
  region: HTMLElement,
): ReadableCandidate {
  const text = normalizeText(getVisibleText(element));
  const wordCount = text ? text.split(/\s+/u).length : 0;
  const base = { element, text, wordCount, characterCount: text.length };

  if (!region.contains(element)) return { ...base, rejection: 'outside-main-content' };
  if (isInsideAdvertisement(element)) return { ...base, rejection: 'advertisement' };
  if (isInterfaceElement(element, region)) return { ...base, rejection: 'navigation-or-interface' };
  if (!isVisibleElement(element)) return { ...base, rejection: 'hidden' };
  if (!text) return { ...base, rejection: 'empty' };
  if (wordCount < MIN_READABLE_WORDS || text.length < MIN_READABLE_CHARACTERS) {
    return { ...base, rejection: 'below-minimum-length' };
  }
  return base;
}

function regionScore(element: HTMLElement): number {
  if (!isVisibleElement(element) || isInsideAdvertisement(element) || isInterfaceElement(element)) {
    return Number.NEGATIVE_INFINITY;
  }

  const blocks = Array.from(element.querySelectorAll<HTMLElement>(READABLE_BLOCK_SELECTOR));
  const readable = blocks
    .map((block) => inspectReadableCandidate(block, element))
    .filter((candidate) => !candidate.rejection);
  if (readable.length === 0) return Number.NEGATIVE_INFINITY;

  const readableCharacters = readable.reduce((sum, candidate) => sum + candidate.characterCount, 0);
  const allText = normalizeText(getVisibleText(element));
  const linkCharacters = Array.from(element.querySelectorAll<HTMLAnchorElement>('a'))
    .reduce((sum, link) => sum + normalizeText(link.textContent ?? '').length, 0);
  const linkDensity = allText.length > 0 ? linkCharacters / allText.length : 1;
  const descendantCount = Math.max(1, element.querySelectorAll('*').length);
  const density = readableCharacters / Math.sqrt(descendantCount);
  const semanticBonus = element.matches('[itemprop="articleBody"]')
    ? 1_200
    : element.matches('article')
      ? 1_000
      : element.matches('main, [role="main"]')
        ? 700
        : 450;

  return density + readable.length * 140 + semanticBonus - linkDensity * 1_000;
}

export function findPrimaryReadableRegion(document: Document): ReadableRegion | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(MAIN_REGION_SELECTOR));
  const ranked = candidates
    .map((element) => ({ element, score: regionScore(element) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score);
  if (ranked[0]) return ranked[0];

  const body = document.body;
  if (!body) return null;
  const bodyScore = regionScore(body);
  return Number.isFinite(bodyScore) ? { element: body, score: bodyScore } : null;
}

export function readableBlocks(region: HTMLElement): HTMLElement[] {
  return Array.from(region.querySelectorAll<HTMLElement>(READABLE_BLOCK_SELECTOR));
}
