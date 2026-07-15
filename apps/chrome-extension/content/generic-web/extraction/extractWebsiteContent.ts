import type { ExtractedHeading, WebsiteContent } from '../../../shared/websiteContent';
import { isInsideAdvertisement } from './advertisements';
import { getVisibleText, isVisibleElement } from './visibility';

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
const PARAGRAPH_SELECTOR = 'p';

function shouldExtract(element: HTMLElement): boolean {
  return (
    !element.closest('#signverse-ai-widget-host') &&
    !isInsideAdvertisement(element) &&
    isVisibleElement(element)
  );
}

function uniqueByText<T extends { text: string }>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.text.toLocaleLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractHeadings(root: ParentNode): ExtractedHeading[] {
  const headings = Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .filter(shouldExtract)
    .map((element) => ({
      level: Number.parseInt(element.tagName.slice(1), 10) as ExtractedHeading['level'],
      text: getVisibleText(element),
    }))
    .filter((heading) => heading.text.length > 0);

  return uniqueByText(headings);
}

function extractParagraphs(root: ParentNode): string[] {
  const seen = new Set<string>();

  return Array.from(root.querySelectorAll<HTMLElement>(PARAGRAPH_SELECTOR))
    .filter(shouldExtract)
    .map(getVisibleText)
    .filter((paragraph) => {
      const key = paragraph.toLocaleLowerCase();
      if (!paragraph || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function extractWebsiteContent(root: ParentNode = document): WebsiteContent {
  if (!document.documentElement || !document.body) {
    throw new Error('This page is not ready for content extraction.');
  }

  return {
    pageTitle: document.title.trim() || 'Untitled page',
    pageUrl: window.location.href,
    headings: extractHeadings(root),
    paragraphs: extractParagraphs(root),
  };
}
