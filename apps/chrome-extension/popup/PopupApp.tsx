import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  addExcludedDomain,
  completeOnboarding,
  getSitePreferences,
  isSiteEnabled,
  normalizeDomain,
  removeExcludedDomain,
  setDomainEnabled,
  type SitePreferences,
} from '../shared/sitePreferences';
import type { AudioCaptureMessage } from '../shared/audioCapture';

interface PageState {
  hostname: string;
  pageTitle: string;
  preferences: SitePreferences;
  tabId: number;
  url: string;
}

type ViewState =
  | { kind: 'loading' }
  | ({ kind: 'ready' } & PageState)
  | { kind: 'error'; message: string };

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active browser tab is available.');
  if (!tab.url?.startsWith('http://') && !tab.url?.startsWith('https://')) {
    throw new Error('Open a regular website to use SignVerse.');
  }
  return tab;
}

async function loadPageState(): Promise<PageState> {
  const [tab, preferences] = await Promise.all([getActiveTab(), getSitePreferences()]);
  const tabId = tab.id;
  if (tabId === undefined) throw new Error('No active browser tab is available.');
  const hostname = new URL(tab.url ?? '').hostname;
  return {
    hostname,
    pageTitle: tab.title || 'Untitled page',
    preferences,
    tabId,
    url: tab.url ?? '',
  };
}

function Onboarding({ onComplete }: { onComplete: () => Promise<void> }) {
  const continueButton = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => continueButton.current?.focus(), []);

  return (
    <section aria-labelledby="signverse-onboarding-title" className="space-y-5 px-6 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
          Welcome to SignVerse
        </p>
        <h1 className="mt-2 text-xl font-semibold" id="signverse-onboarding-title">
          Accessibility with clear privacy controls
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Before SignVerse starts, review how it accesses content and when information leaves
          your browser.
        </p>
      </div>

      <div className="space-y-3" role="list">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4" role="listitem">
          <strong className="text-sm text-slate-100">Read supported pages</strong>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            SignVerse reads the current article context or live captions so it can interpret them.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4" role="listitem">
          <strong className="text-sm text-slate-100">Contact your configured backend</strong>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Extracted text is sent to the SignVerse backend for translation and ISL processing.
            The extension does not save page content.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4" role="listitem">
          <strong className="text-sm text-slate-100">Optional video-audio access</strong>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            YouTube tab audio is captured only when a transcript is unavailable. Audio is routed
            to the configured backend and is not stored by the extension.
          </p>
        </div>
      </div>

      <p className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-xs leading-5 text-cyan-100">
        You can disable SignVerse for any site and manage excluded domains from this popup.
        Settings stay in Chrome local storage.
      </p>

      <button
        aria-label="Accept SignVerse privacy notice and continue"
        className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void onComplete().finally(() => setSaving(false));
        }}
        ref={continueButton}
        type="button"
      >
        {saving ? 'Saving privacy choice…' : 'Continue to SignVerse'}
      </button>
    </section>
  );
}

function SiteControls({
  hostname,
  pageTitle,
  preferences,
  tabId,
  url,
  onPreferencesChange,
}: PageState & { onPreferencesChange: (preferences: SitePreferences) => void }) {
  const [domainInput, setDomainInput] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [audioState, setAudioState] = useState<
    { kind: 'idle' | 'listening' | 'starting' } | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const enabled = isSiteEnabled(hostname, preferences);
  const isYouTubeWatchPage =
    /(^|\.)youtube\.com$/iu.test(hostname) &&
    (new URL(url).pathname === '/watch' || new URL(url).pathname.startsWith('/shorts/'));

  async function startVideoAudio(): Promise<void> {
    setAudioState({ kind: 'starting' });
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SIGNVERSE_AUDIO_FALLBACK_START',
        target: 'background',
        tabId,
      } satisfies AudioCaptureMessage) as { error?: string; ok: boolean };
      setAudioState(response.ok
        ? { kind: 'listening' }
        : {
            kind: 'error',
            message: response.error ?? 'Video-audio transcription could not start.',
          });
    } catch (error) {
      setAudioState({
        kind: 'error',
        message: error instanceof Error
          ? error.message
          : 'Video-audio transcription could not start.',
      });
    }
  }

  async function stopVideoAudio(): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'SIGNVERSE_AUDIO_FALLBACK_STOP',
        target: 'background',
        tabId,
      } satisfies AudioCaptureMessage);
    } finally {
      setAudioState({ kind: 'idle' });
    }
  }

  async function update(operation: () => Promise<SitePreferences>) {
    setSaving(true);
    setFormError('');
    try {
      onPreferencesChange(await operation());
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The site setting could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function addDomain(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeDomain(domainInput);
    if (!normalized) {
      setFormError('Enter a valid domain, such as example.com.');
      return;
    }
    void update(async () => {
      const next = await addExcludedDomain(normalized);
      setDomainInput('');
      return next;
    });
  }

  return (
    <section aria-labelledby="signverse-controls-title" className="space-y-4 px-6 py-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500" id="signverse-controls-title">
              Active page
            </h1>
            <p className="mt-1 truncate text-sm font-medium text-slate-200">{pageTitle}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{hostname}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            enabled
              ? 'bg-emerald-400/15 text-emerald-300'
              : 'bg-slate-700 text-slate-300'
          }`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <button
          aria-label={`${enabled ? 'Disable' : 'Enable'} SignVerse on ${hostname}`}
          aria-pressed={enabled}
          className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition motion-reduce:transition-none ${
            enabled
              ? 'border border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800'
              : 'bg-violet-500 text-white hover:bg-violet-400'
          }`}
          disabled={saving}
          onClick={() => void update(() => setDomainEnabled(hostname, !enabled))}
          type="button"
        >
          {enabled ? 'Disable on this site' : 'Enable on this site'}
        </button>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          {enabled
            ? 'Reading context and supported live captions may be sent to your configured backend.'
            : 'Extraction, backend connections, audio capture, and the interpreter are stopped here.'}
        </p>
      </div>

      {isYouTubeWatchPage && enabled && (
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-5">
          <h2 className="text-sm font-semibold text-cyan-100">
            Listen without YouTube captions
          </h2>
          <p className="mt-1 text-xs leading-5 text-cyan-100/70">
            Use the video&apos;s English audio when no official transcript is available.
            Chrome requires this one-click action for each newly opened YouTube tab.
          </p>
          <button
            aria-label={audioState.kind === 'listening'
              ? 'Stop listening to YouTube video audio'
              : 'Start listening to YouTube video audio without captions'}
            className="mt-4 w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
            disabled={audioState.kind === 'starting'}
            onClick={() => void (
              audioState.kind === 'listening' ? stopVideoAudio() : startVideoAudio()
            )}
            type="button"
          >
            {audioState.kind === 'starting'
              ? 'Connecting to video audio…'
              : audioState.kind === 'listening'
                ? 'Stop listening'
                : 'Listen without captions'}
          </button>
          {audioState.kind === 'error' && (
            <p className="mt-3 text-xs leading-5 text-rose-200" role="alert">
              {audioState.message}
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-semibold text-slate-100">Excluded domains</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          An entry also disables its subdomains.
        </p>
        <form className="mt-4 flex gap-2" onSubmit={addDomain}>
          <label className="sr-only" htmlFor="signverse-excluded-domain">Domain to exclude</label>
          <input
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
            id="signverse-excluded-domain"
            onChange={(event) => setDomainInput(event.target.value)}
            placeholder="example.com"
            value={domainInput}
          />
          <button
            className="rounded-lg border border-violet-300/30 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-400/10"
            disabled={saving}
            type="submit"
          >
            Add
          </button>
        </form>
        {formError && <p className="mt-2 text-xs text-rose-300" role="alert">{formError}</p>}
        {preferences.excludedDomains.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">No domains are excluded.</p>
        ) : (
          <ul aria-label="Excluded SignVerse domains" className="mt-4 space-y-2">
            {preferences.excludedDomains.map((domain) => (
              <li className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/80 px-3 py-2" key={domain}>
                <span className="min-w-0 truncate text-xs text-slate-300">{domain}</span>
                <button
                  aria-label={`Remove ${domain} from excluded domains`}
                  className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-violet-200 hover:bg-violet-400/10"
                  disabled={saving}
                  onClick={() => void update(() => removeExcludedDomain(domain))}
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function PopupApp() {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });

  function connectToPage() {
    setView({ kind: 'loading' });
    void loadPageState()
      .then((status) => setView({ kind: 'ready', ...status }))
      .catch((error: unknown) => setView({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to connect to this page.',
      }));
  }

  useEffect(connectToPage, []);

  return (
    <main className="min-h-[520px] w-[380px] bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="grid size-10 place-items-center rounded-2xl bg-violet-500 font-black text-white shadow-lg shadow-violet-500/20">
            SV
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">SignVerse AI</p>
            <p className="text-xs text-slate-400">Accessible content interpretation</p>
          </div>
        </div>
      </header>

      {view.kind === 'loading' && (
        <section aria-busy="true" aria-live="polite" className="px-6 py-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="h-3 w-28 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
            <span className="sr-only">Loading SignVerse preferences…</span>
          </div>
        </section>
      )}

      {view.kind === 'error' && (
        <section className="px-6 py-6">
          <div aria-live="assertive" className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5" role="alert">
            <p className="font-medium text-amber-200">Page unavailable</p>
            <p className="mt-2 text-sm leading-6 text-amber-100/70">{view.message}</p>
            <button className="mt-4 rounded-lg border border-amber-300/30 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-300/10" onClick={connectToPage} type="button">
              Try again
            </button>
          </div>
        </section>
      )}

      {view.kind === 'ready' && !view.preferences.onboardingComplete && (
        <Onboarding
          onComplete={async () => {
            const preferences = await completeOnboarding();
            setView({ ...view, preferences });
          }}
        />
      )}

      {view.kind === 'ready' && view.preferences.onboardingComplete && (
        <SiteControls
          {...view}
          onPreferencesChange={(preferences) => setView({ ...view, preferences })}
        />
      )}

      <footer className="px-6 pb-5 text-center text-[11px] text-slate-600">
        Website · YouTube · Google Meet
      </footer>
    </main>
  );
}
