import { useEffect, useState } from 'react';
import type { ContentStatus, ExtensionMessage, ExtensionResponse } from '../shared/messages';
import { createMessage } from '../shared/messages';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: ContentStatus }
  | { kind: 'error'; message: string };

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active browser tab is available.');
  }

  if (!tab.url?.startsWith('http://') && !tab.url?.startsWith('https://')) {
    throw new Error('Open a regular website to use the SignVerse mock.');
  }

  return tab;
}

async function sendToContent(
  type: ExtensionMessage['type'],
): Promise<ContentStatus> {
  const tab = await getActiveTab();

  const message = createMessage(type);
  const response = (await chrome.tabs.sendMessage(tab.id!, message)) as ExtensionResponse;

  if (!response || response.correlationId !== message.correlationId) {
    throw new Error('The page returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}

export function PopupApp() {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    void sendToContent('SIGNVERSE_GET_STATUS')
      .then((status) => setView({ kind: 'ready', status }))
      .catch((error: unknown) =>
        setView({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unable to connect to this page.',
        }),
      );
  }, []);

  async function toggleMock() {
    setIsUpdating(true);

    try {
      const status = await sendToContent('SIGNVERSE_TOGGLE_MOCK');
      setView({ kind: 'ready', status });
    } catch (error) {
      setView({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to update the mock.',
      });
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <main className="min-h-[520px] w-[360px] bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-violet-500 font-black text-white shadow-lg shadow-violet-500/20">
            SV
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">SignVerse AI</p>
            <p className="text-xs text-slate-400">Chrome extension foundation</p>
          </div>
        </div>
      </header>

      <section className="space-y-5 px-6 py-6">
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
            <span className="size-2 rounded-full bg-violet-400" />
            Mock mode
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            This foundation uses local mock data only. No audio, AI, or network service is active.
          </p>
        </div>

        {view.kind === 'loading' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
            Connecting to the active page…
          </div>
        )}

        {view.kind === 'error' && (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
            <p className="font-medium text-amber-200">Page unavailable</p>
            <p className="mt-2 text-sm leading-6 text-amber-100/70">{view.message}</p>
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
                    {view.status.pageTitle}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    view.status.enabled
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {view.status.enabled ? 'Active' : 'Paused'}
                </span>
              </div>

              <div className="mt-5 rounded-xl bg-slate-900/80 p-4">
                <p className="text-xs font-medium text-slate-500">Mock output</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{view.status.mockText}</p>
              </div>
            </div>

            <button
              className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
              disabled={isUpdating}
              onClick={() => void toggleMock()}
              type="button"
            >
              {isUpdating
                ? 'Updating…'
                : view.status.enabled
                  ? 'Pause mock interpreter'
                  : 'Start mock interpreter'}
            </button>
          </>
        )}
      </section>

      <footer className="px-6 pb-5 text-center text-[11px] text-slate-600">
        Phase 1 foundation · No production interpretation
      </footer>
    </main>
  );
}
