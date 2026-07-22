import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractReadingContext,
  resolveReadingBlock,
} from '../../content/generic-web/extraction/extractReadingContext';

const FIRST_PARAGRAPH = 'The first readable paragraph explains the article clearly with enough meaningful context for accessible interpretation.';
const SECOND_PARAGRAPH = 'This second paragraph sits under the pointer and contains enough detailed prose to pass every readability threshold.';
const LIST_ITEM = 'This readable list item contains a complete explanatory sentence with sufficient detail for interpretation.';
const CAPTION = 'This accessible image caption explains the illustration with enough descriptive words for interpretation.';
const HEADING = 'A sufficiently descriptive heading for the primary article section content';

function makeElementsVisible() {
  return vi.spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([{} as DOMRect] as unknown as DOMRectList);
}

describe('localized website reading context', () => {
  beforeEach(() => {
    document.title = 'Localized article';
    document.body.innerHTML = `
      <header><p>Account settings and navigation controls should never be interpreted as article content.</p></header>
      <nav><p>Home products pricing documentation support and many other interface navigation destinations.</p></nav>
      <main>
        <article>
          <h1>${HEADING}</h1>
          <p id="first">${FIRST_PARAGRAPH}</p>
          <p id="second"><span>${SECOND_PARAGRAPH}</span></p>
          <ul><li id="item">${LIST_ITEM}</li></ul>
          <figure><figcaption id="caption">${CAPTION}</figcaption></figure>
        </article>
        <aside><p>Related links recommendations and promotional interface content should always be ignored here.</p></aside>
      </main>
      <footer><p>Privacy terms contact links and site controls are not part of the readable article.</p></footer>
    `;
    makeElementsVisible();
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('interprets only a sufficiently descriptive selection inside the primary article', () => {
    const first = document.querySelector('#first')!;
    const text = first.firstChild!;
    const selectedText = 'paragraph explains the article clearly with enough meaningful context for accessible interpretation';
    const start = text.textContent!.indexOf(selectedText);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + selectedText.length);
    document.getSelection()!.addRange(range);

    const content = extractReadingContext({
      document,
      anchor: document.querySelector('#second'),
    });

    expect(content.headings).toEqual([]);
    expect(content.paragraphs).toEqual([selectedText]);
    expect(content.readingContext).toEqual({
      source: 'selection', tagName: 'p', truncated: false,
    });
  });

  it('finds valid paragraphs, list items, headings, and captions within the main article', () => {
    const secondSpan = document.querySelector('#second span')!;
    expect(resolveReadingBlock({ document, anchor: secondSpan })).toBe(
      document.querySelector('#second'),
    );

    for (const selector of ['h1', '#item', '#caption']) {
      const element = document.querySelector<HTMLElement>(selector)!;
      const content = extractReadingContext({ document, anchor: element });
      expect(content.readingContext?.tagName).toBe(element.tagName.toLowerCase());
      expect([...content.headings.map(({ text }) => text), ...content.paragraphs])
        .toEqual([element.textContent]);
    }
  });

  it('resolves a collapsed selection as the current caret context', () => {
    const secondText = document.querySelector('#second span')!.firstChild!;
    const range = document.createRange();
    range.setStart(secondText, 8);
    range.collapse(true);
    document.getSelection()!.addRange(range);

    const content = extractReadingContext({ document });

    expect(content.paragraphs).toEqual([SECOND_PARAGRAPH]);
    expect(content.readingContext).toMatchObject({ source: 'caret', tagName: 'p' });
  });

  it('uses the first valid primary-content block as the initial context', () => {
    const content = extractReadingContext({ document });

    expect(content.readingContext).toMatchObject({ source: 'viewport', tagName: 'h1' });
    expect(content.headings).toEqual([{ level: 1, text: HEADING }]);
    expect(content.paragraphs).not.toContain(SECOND_PARAGRAPH);
  });

  it('rejects short candidates and automatically advances to the next valid paragraph', () => {
    document.querySelector('article')!.insertAdjacentHTML(
      'afterbegin',
      '<p id="short">Too short to interpret.</p>',
    );
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const content = extractReadingContext({
      document,
      anchor: document.querySelector('#short'),
    });

    expect(content.headings).toEqual([{ level: 1, text: HEADING }]);
    expect(debug).toHaveBeenCalledWith(
      '[SignVerse] reading_context_candidate_rejected',
      expect.objectContaining({
        selector: expect.stringContaining('p#short'),
        reason: 'below-minimum-length',
        text: 'Too short to interpret.',
      }),
    );
  });

  it('ignores advertisements, navigation, widgets, and selections outside main content', () => {
    document.querySelector('article')!.insertAdjacentHTML(
      'afterbegin',
      `<p role="advertisement" id="ad">Sponsored advertising copy contains many words but must never enter interpretation.</p>
       <div id="signverse-ai-widget-host"><p id="widget">SignVerse interface status contains enough words but is never readable page content.</p></div>`,
    );
    const navigationText = document.querySelector('nav p')!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(navigationText);
    document.getSelection()!.addRange(range);

    const content = extractReadingContext({
      document,
      anchor: document.querySelector('#widget'),
    });

    expect(content.headings).toEqual([{ level: 1, text: HEADING }]);
    expect(content.paragraphs).not.toContain(navigationText.textContent);
  });

  it('falls back to a Readability-style body region while excluding page chrome', () => {
    document.body.innerHTML = `
      <div class="cookie-banner"><p>Cookie choices settings privacy controls and consent preferences should not be interpreted.</p></div>
      <div class="story-copy"><p id="story">A standalone story paragraph remains readable even when the publisher provides no article or main element.</p></div>
    `;

    const content = extractReadingContext({ document });

    expect(content.paragraphs).toEqual([
      'A standalone story paragraph remains readable even when the publisher provides no article or main element.',
    ]);
  });

  it('does not treat page-level feature classes as ancestors of interface chrome', () => {
    document.documentElement.className = 'vector-feature-main-menu-pinned-enabled';
    document.body.className = 'page-shell sidebar-collapsed';

    const content = extractReadingContext({
      document,
      anchor: document.querySelector('#first'),
    });

    expect(content.paragraphs).toEqual([FIRST_PARAGRAPH]);
    expect(content.readingContext).toMatchObject({ source: 'pointer', tagName: 'p' });

    document.documentElement.removeAttribute('class');
    document.body.removeAttribute('class');
  });
});
