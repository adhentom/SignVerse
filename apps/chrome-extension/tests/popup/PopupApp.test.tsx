import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupApp } from '../../popup/PopupApp';
import {
  SITE_PREFERENCES_STORAGE_KEY,
  type SitePreferences,
} from '../../shared/sitePreferences';

describe('PopupApp production controls', () => {
  let container: HTMLDivElement;
  let root: Root;
  let preferences: SitePreferences;
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    preferences = { onboardingComplete: false, excludedDomains: [] };
    sendMessage = vi.fn(async () => ({ ok: true, tabId: 9 }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function installChrome(url: string) {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      tabs: {
        query: vi.fn(async () => [{
          id: 9,
          title: 'Accessible video',
          url,
        }]),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({ [SITE_PREFERENCES_STORAGE_KEY]: preferences })),
          set: vi.fn(async (value: Record<string, SitePreferences>) => {
            preferences = value[SITE_PREFERENCES_STORAGE_KEY];
          }),
        },
      },
    });
  }

  async function renderPopup() {
    await act(async () => root.render(<PopupApp />));
    await act(async () => undefined);
  }

  it('explains permissions and privacy before first use', async () => {
    installChrome('https://www.youtube.com/watch?v=test');
    await renderPopup();

    expect(container.textContent).toContain('Accessibility with clear privacy controls');
    expect(container.textContent).toContain('Read supported pages');
    expect(container.textContent).toContain('Contact your configured backend');
    expect(container.textContent).toContain('Optional video-audio access');
    expect(container.textContent).toContain('does not save page content');
    expect(container.querySelector('button[aria-label*="privacy notice"]')).not.toBeNull();
  });

  it('completes onboarding and exposes an accessible per-site switch', async () => {
    installChrome('https://www.youtube.com/watch?v=test');
    await renderPopup();

    const continueButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label*="privacy notice"]',
    );
    await act(async () => continueButton?.click());

    expect(preferences.onboardingComplete).toBe(true);
    expect(container.textContent).toContain('Enabled');
    const siteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Disable SignVerse on www.youtube.com"]',
    );
    expect(siteButton?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => siteButton?.click());
    expect(preferences.excludedDomains).toEqual(['www.youtube.com']);
    expect(container.textContent).toContain('Extraction, backend connections, audio capture');
  });

  it('adds and removes domains from the exclusion list', async () => {
    preferences = { onboardingComplete: true, excludedDomains: [] };
    installChrome('https://example.com/article');
    await renderPopup();

    const input = container.querySelector<HTMLInputElement>('#signverse-excluded-domain');
    await act(async () => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, 'news.example.org');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const form = input?.closest('form');
    await act(async () => form?.dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    })));

    expect(preferences.excludedDomains).toContain('news.example.org');
    expect(container.textContent).toContain('news.example.org');

    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove news.example.org from excluded domains"]',
    );
    await act(async () => remove?.click());
    expect(preferences.excludedDomains).not.toContain('news.example.org');
  });

  it('starts user-authorized video audio without enabling YouTube captions', async () => {
    preferences = { onboardingComplete: true, excludedDomains: [] };
    installChrome('https://www.youtube.com/watch?v=no-transcript');
    await renderPopup();

    const listen = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Start listening to YouTube video audio without captions"]',
    );
    expect(listen).not.toBeNull();

    await act(async () => listen?.click());

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SIGNVERSE_AUDIO_FALLBACK_START',
      target: 'background',
      tabId: 9,
    });
    expect(container.textContent).toContain('Stop listening');
  });
});
