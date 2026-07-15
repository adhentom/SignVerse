export const GOOGLE_MEET_SELECTORS = {
  captionRegions: [
    '[jscontroller="D1tHje"]',
    '[aria-live="polite"][role="region"]',
    '[aria-live="assertive"][role="region"]',
  ].join(','),
  captionRows: [
    '[data-caption-row]',
    '[data-participant-id]',
    '[jscontroller="D1tHje"]',
  ].join(','),
  captionText: [
    '[data-caption-text]',
    '[data-message-text]',
    '.ygicle',
    '.bh44bd',
    '.VbkSUe',
  ].join(','),
  speaker: [
    '[data-speaker-name]',
    '[data-participant-name]',
    '.zs7s8d',
    '.CNusmb',
  ].join(','),
  captionsButton: [
    'button[aria-label*="caption" i]',
    '[role="button"][aria-label*="caption" i]',
    '[data-is-caption-button]',
  ].join(','),
  meetingTitle: [
    '[data-meeting-title]',
    '[aria-label^="Meeting name:" i]',
    'header h1',
  ].join(','),
  participant: [
    '[role="listitem"][data-participant-id]',
    '[data-participant-id][data-participant-type]',
  ].join(','),
  reconnecting: [
    '[data-call-state="reconnecting"]',
    '[aria-label*="reconnecting" i]',
  ].join(','),
  status: '[role="alert"], [role="status"]',
} as const;
