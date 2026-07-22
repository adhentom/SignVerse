const NON_CONTENT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'CANVAS',
]);

function isElementRendered(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (
    element.hidden ||
    element.getAttribute('aria-hidden') === 'true' ||
    NON_CONTENT_TAGS.has(element.tagName)
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    Number.parseFloat(style.opacity || '1') > 0
  );
}

export function isVisibleElement(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (!isElementRendered(current)) {
      return false;
    }

    current = current.parentElement;
  }

  return element.getClientRects().length > 0;
}

export function getVisibleText(element: HTMLElement): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const fragments: string[] = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const parent = textNode.parentElement;
    const text = textNode.textContent?.replace(/\s+/g, ' ').trim();

    if (parent && text && isVisibleElement(parent)) {
      fragments.push(text);
    }
  }

  return fragments.join(' ').replace(/\s+/g, ' ').trim();
}
