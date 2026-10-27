import { AMAZON_MUSIC_URL_MATCHES } from '~constants/urls';
import type {
  AlbumSearchResult,
  ArtistSearchResult,
  BackgroundController,
  SearchAlbumsInput,
  SearchArtistsInput,
  SearchTracksInput,
  TrackSearchResult
} from '~core/adapter';
import type { ParsedLink } from '~core/links';

import { AmazonAdapter } from './AmazonAdapter';
import type {
  AmznMusic,
  NativeAmazonAlbumsWidget,
  NativeAmazonArtistsWidget,
  NativeAmazonMusicSearchResult,
  NativeAmazonTracksWidget
} from './types';

const SEARCH_ENDPOINT = 'https://na.mesk.skill.music.a2z.com/api/showSearch';
const DEFAULT_DOMAIN = 'music.amazon.com';

const CONFIRMED_DOMAINS = new Set([
  'music.amazon.com',
  'music.amazon.co.uk',
  'music.amazon.ca',
  'music.amazon.in',
  'music.amazon.com.au',
  'music.amazon.co.jp'
]);

const extractDomainFromUrl = (urlString?: string | null): string | null => {
  if (!urlString) {
    return null;
  }
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    if (CONFIRMED_DOMAINS.has(hostname)) {
      return hostname;
    }
  } catch {
    // Malformed URL, handle safely without crashing
  }
  return null;
};

export class AmazonBackgroundController implements BackgroundController {
  private _sourceTabId?: number | null;
  private _sourceDomain?: string | null;

  constructor(sourceTabId?: number | null, sourceDomain?: string | null) {
    this._sourceTabId = sourceTabId;
    this._sourceDomain = sourceDomain;
  }

  public setSourceTabId(tabId: number | null): void {
    this._sourceTabId = tabId;
  }

  public setSourceDomain(domain: string | null): void {
    this._sourceDomain = domain;
  }

  public async resolveDomain(): Promise<string> {
    if (this._sourceDomain) {
      const parsed = extractDomainFromUrl(`https://${this._sourceDomain}`);
      if (parsed) {
        return parsed;
      }
    }

    if (typeof this._sourceTabId === 'number') {
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs?.get) {
          const tab = await chrome.tabs.get(this._sourceTabId);
          const domain = extractDomainFromUrl(tab?.url);
          if (domain) {
            return domain;
          }
        }
      } catch {
        // Tab not found or inaccessible; fall through
      }
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        // 1. Prefer active tab in currently focused window
        const focusedTabs = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
          url: AMAZON_MUSIC_URL_MATCHES
        });
        if (focusedTabs && focusedTabs.length > 0) {
          const domain = extractDomainFromUrl(focusedTabs[0].url);
          if (domain) {
            return domain;
          }
        }

        const tabs = await chrome.tabs.query({
          url: AMAZON_MUSIC_URL_MATCHES
        });

        if (tabs && tabs.length > 0) {
          if (tabs.length === 1) {
            const domain = extractDomainFromUrl(tabs[0].url);
            if (domain) {
              return domain;
            }
          }

          // When multiple tabs are open, avoid arbitrary selection (tabs[0]):
          // 2. Prefer any active tab
          const activeTab = tabs.find((tab) => tab.active);
          if (activeTab) {
            const domain = extractDomainFromUrl(activeTab.url);
            if (domain) {
              return domain;
            }
          }

          // 3. Prefer currently audible tab
          const audibleTab = tabs.find((tab) => tab.audible);
          if (audibleTab) {
            const domain = extractDomainFromUrl(audibleTab.url);
            if (domain) {
              return domain;
            }
          }

          // 4. Prefer most recently accessed tab
          const sorted = [...tabs].sort(
            (a, b) =>
              ((b as any).lastAccessed ?? 0) - ((a as any).lastAccessed ?? 0)
          );
          for (const tab of sorted) {
            const domain = extractDomainFromUrl(tab.url);
            if (domain) {
              return domain;
            }
          }
        }
      }
    } catch {
      // Degrade gracefully
    }

    return DEFAULT_DOMAIN;
  }

  public async searchTracks(
    input: SearchTracksInput
  ): Promise<TrackSearchResult[]> {
    const domain = await this.resolveDomain();
    const query = `${input.name} ${input.artistName}`;

    const response = await this._search(query, domain);
    const widgets = response?.methods?.[0]?.template?.widgets;
    const songsWidget = widgets?.find(
      (widget: any) => widget.header === 'Songs'
    ) as NativeAmazonTracksWidget | undefined;

    const tracks = songsWidget?.items;
    const searchResults = tracks?.map((track: any) => ({
      name: track.primaryText.text,
      artistName: track.secondaryText,
      link: `https://${domain}${track.primaryLink.deeplink}`
    }));

    return searchResults ?? [];
  }

  public async searchAlbums(
    searchInput: SearchAlbumsInput
  ): Promise<AlbumSearchResult[]> {
    const domain = await this.resolveDomain();
    const query = `${searchInput.name} ${searchInput.artistName}`;

    const response = await this._search(query, domain);
    const widgets = response?.methods?.[0]?.template?.widgets;
    const albumsWidget = widgets?.find(
      (widget: any) => widget.header === 'Albums'
    ) as NativeAmazonAlbumsWidget | undefined;

    const albums = albumsWidget?.items;
    const searchResults = albums?.map((album: any) => ({
      name: album.primaryText.text,
      artistName: album.secondaryText,
      link: `https://${domain}${album.primaryLink.deeplink}`
    }));

    return searchResults ?? [];
  }

  public async searchArtists(
    searchInput: SearchArtistsInput
  ): Promise<ArtistSearchResult[]> {
    const domain = await this.resolveDomain();
    const response = await this._search(searchInput.name, domain);
    const widgets = response?.methods?.[0]?.template?.widgets;

    const artistsWidget = widgets?.find(
      (widget: any) => widget.header === 'Artists'
    ) as NativeAmazonArtistsWidget | undefined;

    const artists = artistsWidget?.items;

    const searchResults = artists?.map((album: any) => ({
      name: album.primaryText.text,
      link: `https://${domain}${album.primaryLink.deeplink}`
    }));

    return searchResults ?? [];
  }

  public parseLink(link: string): ParsedLink | null {
    try {
      const parsedLink: Partial<ParsedLink> = {
        musicService: 'AMAZONMUSIC'
      };

      const url = new URL(link);
      const path = url.pathname;
      const pathParts = path.split('/').filter((part) => part !== '');
      const query = url.searchParams;

      if (pathParts[0] === 'albums') {
        if (query.has('trackAsin')) {
          const trackId = query.get('trackAsin');
          parsedLink.trackId = trackId || '';
          parsedLink.albumId = pathParts[1];
          parsedLink.type = 'TRACK';
        } else {
          parsedLink.albumId = pathParts[1];
          parsedLink.type = 'ALBUM';
        }
      } else if (pathParts[0] === 'artists') {
        parsedLink.artistId = pathParts[1];
        parsedLink.type = 'ARTIST';
      }

      return parsedLink.albumId || parsedLink.artistId || parsedLink.trackId
        ? (parsedLink as ParsedLink)
        : null;
    } catch {
      return null;
    }
  }

  public getLink(parsedLink: ParsedLink): string {
    const { type } = parsedLink;
    const baseUrl = this._sourceDomain
      ? `https://${this._sourceDomain}`
      : AmazonAdapter.baseUrl.replace(/\/$/, '');

    if (type === 'ALBUM') {
      return `${baseUrl}/albums/${parsedLink.albumId}`;
    } else if (type === 'ARTIST') {
      return `${baseUrl}/artists/${parsedLink.artistId}`;
    } else if (type === 'TRACK') {
      return `${baseUrl}/albums/${parsedLink.albumId}?trackAsin=${parsedLink.trackId}`;
    } else {
      throw new Error('Invalid link type');
    }
  }

  private async _search(
    query: string,
    domain: string
  ): Promise<NativeAmazonMusicSearchResult> {
    const config = await this._fetchConfig(domain);

    const headers = {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'content-type': 'text/plain;charset=UTF-8',
      pragma: 'no-cache',
      'sec-ch-ua':
        '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site'
    };

    const filter = JSON.stringify({ IsLibrary: ['false'] });
    const keyword = JSON.stringify({
      interface:
        'Web.TemplatesInterface.v1_0.Touch.SearchTemplateInterface.SearchKeywordClientInformation',
      keyword: ''
    });
    const userHash = JSON.stringify({ level: 'LIBRARY_MEMBER' });

    const body = {
      filter,
      headers: this._createBodyHeaders(config, query, domain),
      keyword,
      userHash,
      suggestedKeyword: query
    };

    const response = await fetch(SEARCH_ENDPOINT, {
      headers,
      referrer: `https://${domain}/`,
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: JSON.stringify(body),
      method: 'POST',
      mode: 'cors',
      credentials: 'omit'
    }).then((res) => res.json());

    return response;
  }

  private async _fetchConfig(domain: string): Promise<AmznMusic['appConfig']> {
    const htmlResponse = await fetch(`https://${domain}/`, {
      credentials: 'omit'
    }).then((res) => res.text());

    const extractRegex = (regex: RegExp): string => {
      const match = htmlResponse.matchAll(regex).next();
      return match.value?.[1] ?? '';
    };

    const accessToken = extractRegex(/\"accessToken\": \"(.*)\",?/g);
    const customerId = extractRegex(/\"customerId\": \"(.*)\",?/g);
    const csrfToken = extractRegex(/\"token\": \"(.*)\",?/g);
    const csrfTs = extractRegex(/\"ts\": \"(.*)\",?/g);
    const csrfRnd = extractRegex(/\"rnd\": \"(.*)\",?/g);
    const deviceId = extractRegex(/\"deviceId\": \"(.*)\",?/g);
    const displayLanguage = extractRegex(/\"displayLanguage\": \"(.*)\",?/g);
    const sessionId = extractRegex(/\"sessionId\": \"(.*)\",?/g);
    const version = extractRegex(/\"version\": \"(.*)\",?/g);

    return {
      accessToken,
      csrf: {
        token: csrfToken,
        ts: csrfTs,
        rnd: csrfRnd
      },
      deviceId,
      displayLanguage,
      sessionId,
      customerId,
      version
    };
  }

  private _createBodyHeaders(
    config: AmznMusic['appConfig'],
    query: string,
    domain: string
  ) {
    const csrf = JSON.stringify({
      interface: 'CSRFInterface.v1_0.CSRFHeaderElement',
      token: config.csrf.token,
      timestamp: config.csrf.ts,
      rndNonce: config.csrf.rnd
    });

    const headers = {
      'x-amzn-affiliate-tags': '',
      'x-amzn-application-version': config.version,
      'x-amzn-authentication':
        '{"interface":"ClientAuthenticationInterface.v1_0.ClientTokenElement","accessToken":""}',
      'x-amzn-csrf': csrf,
      'x-amzn-currency-of-preference': 'USD',
      'x-amzn-device-family': 'WebPlayer',
      'x-amzn-device-height': '1080',
      'x-amzn-device-id': config.sessionId,
      'x-amzn-device-language': config.displayLanguage || 'en-US',
      'x-amzn-device-model': 'WEBPLAYER',
      'x-amzn-device-time-zone': 'America/Los_Angeles',
      'x-amzn-device-width': '1920',
      'x-amzn-feature-flags': 'hd-supported,uhd-supported',
      'x-amzn-music-domain': domain,
      'x-amzn-os-version': '1.0',
      'x-amzn-page-url': `https://${domain}/search/${query.replaceAll(
        ' ',
        '+'
      )}?filter=IsLibrary%257Cfalse&sc=none`,
      'x-amzn-ref-marker': '',
      'x-amzn-referer': '',
      'x-amzn-request-id': this._generateRequestId(),
      'x-amzn-session-id': config.sessionId,
      'x-amzn-timestamp': Date.now().toString(),
      'x-amzn-user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'x-amzn-video-player-token': '',
      'x-amzn-weblab-id-overrides': ''
    };

    return JSON.stringify(headers);
  }

  private _generateRequestId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
