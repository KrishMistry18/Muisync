import { getHubMap } from '@plasmohq/messaging/pub-sub';

import { store } from '~store';
import {
  MusicControllerMessage,
  type MusicService,
  type MusicServiceTab
} from '~types';

/**
 * Maps a Chrome command identifier to its corresponding MusicControllerMessage.
 */
export const mapCommandToControllerMessage = (
  command: string
): MusicControllerMessage | undefined => {
  switch (command) {
    case 'play-pause':
      return MusicControllerMessage.PLAY_PAUSE;
    case 'next-track':
      return MusicControllerMessage.NEXT;
    case 'previous-track':
      return MusicControllerMessage.PREVIOUS;
    default:
      return undefined;
  }
};

/**
 * Pure selection strategy to choose the intended music-service tab from candidates.
 * Follows MuiSync tab routing semantics:
 * 1. If currently focused tab in Chrome is a music tab, control that tab.
 * 2. If any music tab is actively playing, control that tab.
 * 3. If any music tab matches the user's preferred music service, control that tab.
 * 4. Fall back to the first connected candidate tab.
 */
export const selectTargetMusicServiceTab = (
  tabs: MusicServiceTab[],
  activeTabId?: number,
  preferredService?: MusicService
): MusicServiceTab | undefined => {
  if (!tabs || tabs.length === 0) {
    return undefined;
  }

  if (tabs.length === 1) {
    return tabs[0];
  }

  // 1. If currently focused tab in the browser is one of the music service tabs, control that tab
  if (activeTabId !== undefined) {
    const activeTab = tabs.find((t) => t.tabId === activeTabId);
    if (activeTab) {
      return activeTab;
    }
  }

  // 2. If any music service tab is actively playing, control that tab
  const playingTab = tabs.find((t) => t.playbackState?.isPlaying);
  if (playingTab) {
    return playingTab;
  }

  // 3. If a tab matches user's preferred music service, control that tab
  if (preferredService) {
    const preferredTab = tabs.find((t) => t.musicService === preferredService);
    if (preferredTab) {
      return preferredTab;
    }
  }

  // 4. Default to first connected tab
  return tabs[0];
};

/**
 * Finds the currently active, connected music service tab using live hub ports
 * and tab state, preventing stale/closed tab routing.
 */
export const findTargetMusicServiceTab = async (): Promise<
  MusicServiceTab | undefined
> => {
  const state = store.getState();
  const musicServiceTabs = state.musicServiceTabs || [];
  const hubMap = getHubMap();

  const connectedTabs: MusicServiceTab[] = [];
  for (const tab of musicServiceTabs) {
    if (!hubMap.has(tab.tabId)) {
      continue;
    }

    try {
      const chromeTab = await chrome.tabs.get(tab.tabId);
      if (chromeTab) {
        connectedTabs.push(tab);
      }
    } catch {
      // Tab closed or inaccessible
    }
  }

  if (connectedTabs.length === 0) {
    return undefined;
  }

  let activeTabId: number | undefined;
  try {
    const activeTabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    activeTabId = activeTabs[0]?.id;
  } catch {
    // If tab query fails, proceed without activeTabId
  }

  const preferredService = state.settings?.preferredMusicService;
  return selectTargetMusicServiceTab(
    connectedTabs,
    activeTabId,
    preferredService
  );
};

/**
 * Handles incoming global keyboard commands and dispatches them to the intended music tab.
 */
export const handleCommand = async (command: string): Promise<boolean> => {
  const messageName = mapCommandToControllerMessage(command);
  if (!messageName) {
    console.warn(`[MuiSync] Unknown keyboard command: ${command}`);
    return false;
  }

  const targetTab = await findTargetMusicServiceTab();
  if (!targetTab) {
    console.info(
      `[MuiSync] No suitable music service tab found for command: ${command}`
    );
    return false;
  }

  const hubMap = getHubMap();
  const port = hubMap.get(targetTab.tabId);
  if (!port) {
    console.warn(`[MuiSync] Port disconnected for tab ${targetTab.tabId}`);
    return false;
  }

  port.postMessage({
    to: targetTab.tabId,
    payload: {
      name: messageName
    }
  });

  return true;
};

/**
 * Registers the chrome.commands.onCommand listener in the background service worker.
 */
export const initializeCommandsHandler = (): void => {
  if (chrome?.commands?.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
      handleCommand(command).catch((err) => {
        console.error('[MuiSync] Error handling keyboard command:', err);
      });
    });
  }
};
