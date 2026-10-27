export const SPOTIFY_URL_MATCH = '*://open.spotify.com/*';
export const YOUTUBE_MUSIC_URL_MATCH = '*://music.youtube.com/*';
export const AMAZON_MUSIC_URL_MATCHES = [
  'https://music.amazon.com/*',
  'https://music.amazon.co.uk/*',
  'https://music.amazon.ca/*',
  'https://music.amazon.in/*',
  'https://music.amazon.com.au/*',
  'https://music.amazon.co.jp/*'
];
export const AMAZON_MUSIC_URL_MATCH = AMAZON_MUSIC_URL_MATCHES[0];
export const APPLE_MUSIC_URL_MATCH = '*://music.apple.com/*';

export const ALL_URL_MATCHES = [
  SPOTIFY_URL_MATCH,
  YOUTUBE_MUSIC_URL_MATCH,
  ...AMAZON_MUSIC_URL_MATCHES,
  APPLE_MUSIC_URL_MATCH
];

export const SPOTIFY_URL = 'https://open.spotify.com';
export const YOUTUBE_MUSIC_URL = 'https://music.youtube.com';
export const AMAZON_MUSIC_URL = 'https://music.amazon.com';
export const APPLE_MUSIC_URL = 'https://music.apple.com';
