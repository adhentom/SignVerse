import { useEffect, useState } from 'react';
import { getSignVerseVisible, setSignVerseVisible } from '../shared/visibility';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; automatic: boolean; enabled: boolean; pageTitle: string }
  | { kind: 'error'; message: string };

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active browser tab is available.');
  }

  if (!tab.url?.startsWith('http://') && !tab.url?.startsWith('https://')) {
    throw new Error('Open a regular website to use SignVerse.');
  }

  return tab;
}

async function loadPageState(): Promise<{ automatic: boolean; enabled: boolean; pageTitle: string }> {
  const tab = await getActiveTab();
  const hostname = new URL(tab.url!).hostname.toLowerCase();
  const automatic = hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  return {
    automatic,
    enabled: automatic || await getSignVerseVisible(),
    pageTitle: tab.title || 'Untitled page',
  };
}

export function PopupApp() {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });

  function connectToPage() {
    setView({ kind: 'loading' });
    void loadPageState()
      .then((status) => setView({ kind: 'ready', ...status }))
      .catch((error: unknown) =>
        setView({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unable to connect to this page.',
        }),
      );
  }

  useEffect(() => {
    connectToPage();
  }, []);

  return (
    <main className="min-h-[520px] w-[360px] bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-violet-500 font-black text-white shadow-lg shadow-violet-500/20">
            SV
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">SignVerse AI</p>
            <p className="text-xs text-slate-400">Accessible content interpretation</p>
          </div>
        </div>
      </header>

      <section className="space-y-5 px-6 py-6">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
            <span className="size-2 rounded-full bg-emerald-400" />
            User controlled
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            SignVerse stays hidden until you choose to show it.
          </p>
        </div>

        {view.kind === 'loading' && (
          <div aria-busy="true" aria-live="polite" className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="h-3 w-28 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
            <span className="sr-only">Connecting to the active page…</span>
          </div>
        )}

        {view.kind === 'error' && (
          <div aria-live="assertive" className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5" role="alert">
            <p className="font-medium text-amber-200">Page unavailable</p>
            <p className="mt-2 text-sm leading-6 text-amber-100/70">{view.message}</p>
            <button
              className="mt-4 rounded-lg border border-amber-300/30 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10"
              onClick={connectToPage}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {view.kind === 'ready' && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Active page
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-slate-200">
                    {view.pageTitle}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {view.enabled ? 'Visible' : 'Hidden'}
                </span>
              </div>

              {view.automatic ? (
                <div className="mt-5 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                  SignVerse starts automatically on YouTube. Official captions are preferred;
                  video audio is transcribed automatically when captions are unavailable.
                </div>
              ) : (
                <button
                  aria-pressed={view.enabled}
                  className="mt-5 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
                  onClick={() => {
                    const enabled = !view.enabled;
                    void setSignVerseVisible(enabled).then(() => {
                      setView({ ...view, enabled });
                    });
                  }}
                  type="button"
                >
                  {view.enabled ? 'Hide SignVerse on pages' : 'Show SignVerse on pages'}
                </button>
              )}

              <div className="mt-5 rounded-xl bg-slate-900/80 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">How to use</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Open a YouTube video and SignVerse starts automatically. On other supported
                  pages, use the visibility control above when you need the interpreter.
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      <footer className="px-6 pb-5 text-center text-[11px] text-slate-600">
        Website · YouTube · Google Meet
      </footer>
    </main>
  );
}
