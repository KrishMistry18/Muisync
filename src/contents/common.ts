import type { PlasmoCSConfig } from 'plasmo';

import { enableKeyControls } from '~core/keys';

export const config: PlasmoCSConfig = {
  matches: [
    '*://music.apple.com/*',
    '*://open.spotify.com/*',
    '*://music.youtube.com/*',
    '*://music.amazon.com/*',
    '*://music.amazon.co.uk/*',
    '*://music.amazon.ca/*',
    '*://music.amazon.in/*',
    '*://music.amazon.com.au/*',
    '*://music.amazon.co.jp/*'
  ],
  run_at: 'document_start'
};

const initialize = () => {
  window.addEventListener('SynQ:GetExtensionId', () => {
    window.dispatchEvent(
      new CustomEvent('SynQ:ExtensionId', { detail: chrome.runtime.id })
    );
  });

  enableKeyControls();
};

initialize();
