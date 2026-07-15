export const YOUTUBE_SELECTORS = {
  player: '#movie_player',
  video: '#movie_player video, video.html5-main-video',
  captionSegments: '.ytp-caption-window-container .ytp-caption-segment, .caption-window .ytp-caption-segment',
  captionsButton: '.ytp-subtitles-button',
  title: [
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.title yt-formatted-string',
    'meta[name="title"]',
  ],
  channel: [
    'ytd-watch-metadata ytd-channel-name a',
    'ytd-watch-flexy ytd-channel-name a',
    '#owner #channel-name a',
    'meta[itemprop="author"]',
  ],
  metadataRoot: 'ytd-watch-flexy',
  liveBadge: '.ytp-live-badge, .ytp-live',
} as const;
