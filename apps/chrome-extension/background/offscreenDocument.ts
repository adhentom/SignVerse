const OFFSCREEN_PATH = 'offscreen.html';

let creatingDocument: Promise<void> | null = null;

async function documentExists(): Promise<boolean> {
  // `chrome.offscreen.hasDocument()` was added in Chrome 150. SignVerse
  // supports Chrome 116+, where `runtime.getContexts()` is the compatible
  // way to discover an existing offscreen document.
  if (typeof chrome.offscreen.hasDocument === 'function') {
    return chrome.offscreen.hasDocument();
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

/**
 * Creates the single MV3 offscreen audio document without racing concurrent
 * automatic and user-requested capture starts.
 */
export async function ensureAudioOffscreenDocument(): Promise<void> {
  if (await documentExists()) return;
  if (creatingDocument) return creatingDocument;

  creatingDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture user-authorized tab audio for accessible live transcription.',
  }).finally(() => {
    creatingDocument = null;
  });

  return creatingDocument;
}
