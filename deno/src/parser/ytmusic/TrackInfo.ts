import Parser from '../index.ts';
import type Actions from '../../core/Actions.ts';
import type { ApiResponse } from '../../core/Actions.ts';

import Constants from '../../utils/Constants.ts';
import { InnertubeError } from '../../utils/Utils.ts';

import AutomixPreviewVideo from '../classes/AutomixPreviewVideo.ts';
import Endscreen from '../classes/Endscreen.ts';
import Message from '../classes/Message.ts';
import MicroformatData from '../classes/MicroformatData.ts';
import MusicCarouselShelf from '../classes/MusicCarouselShelf.ts';
import MusicDescriptionShelf from '../classes/MusicDescriptionShelf.ts';
import MusicQueue from '../classes/MusicQueue.ts';
import PlayerOverlay from '../classes/PlayerOverlay.ts';
import PlaylistPanel from '../classes/PlaylistPanel.ts';
import RichGrid from '../classes/RichGrid.ts';
import SectionList from '../classes/SectionList.ts';
import Tab from '../classes/Tab.ts';
import WatchNextTabbedResults from '../classes/WatchNextTabbedResults.ts';

import type Format from '../classes/misc/Format.ts';
import type NavigationEndpoint from '../classes/NavigationEndpoint.ts';
import type PlayerLiveStoryboardSpec from '../classes/PlayerLiveStoryboardSpec.ts';
import type PlayerStoryboardSpec from '../classes/PlayerStoryboardSpec.ts';
import type { ObservedArray, YTNode } from '../helpers.ts';
import type { INextResponse, IPlayerResponse } from '../types/ParsedResponse.ts';

import FormatUtils, { DownloadOptions, FormatFilter, FormatOptions, URLTransformer } from '../../utils/FormatUtils.ts';

class TrackInfo {
  #page: [ IPlayerResponse, INextResponse? ];
  #actions: Actions;
  #cpn: string;

  basic_info;
  streaming_data;
  playability_status;
  storyboards?: PlayerStoryboardSpec | PlayerLiveStoryboardSpec;
  endscreen?: Endscreen;

  #playback_tracking;

  tabs?: ObservedArray<Tab>;
  current_video_endpoint?: NavigationEndpoint;
  player_overlays?: PlayerOverlay;

  constructor(data: [ApiResponse, ApiResponse?], actions: Actions, cpn: string) {
    this.#actions = actions;

    const info = Parser.parseResponse<IPlayerResponse>(data[0].data);
    const next = data?.[1]?.data ? Parser.parseResponse<INextResponse>(data[1].data) : undefined;

    this.#page = [ info, next ];
    this.#cpn = cpn;

    if (info.playability_status?.status === 'ERROR')
      throw new InnertubeError('This video is unavailable', info.playability_status);

    if (!info.microformat?.is(MicroformatData))
      throw new InnertubeError('Invalid microformat', info.microformat);

    this.basic_info = {
      ...info.video_details,
      ...{
        description: info.microformat?.description,
        is_unlisted: info.microformat?.is_unlisted,
        is_family_safe: info.microformat?.is_family_safe,
        url_canonical: info.microformat?.url_canonical,
        tags: info.microformat?.tags
      }
    };

    this.streaming_data = info.streaming_data;
    this.playability_status = info.playability_status;
    this.storyboards = info.storyboards;
    this.endscreen = info.endscreen;

    this.#playback_tracking = info.playback_tracking;

    if (next) {
      const tabbed_results = next.contents_memo?.getType(WatchNextTabbedResults)?.[0];

      this.tabs = tabbed_results?.tabs.array().as(Tab);
      this.current_video_endpoint = next.current_video_endpoint;

      // TODO: update PlayerOverlay, YTMusic's is a little bit different.
      this.player_overlays = next.player_overlays?.item().as(PlayerOverlay);
    }
  }

  /**
 * Generates a DASH manifest from the streaming data.
 * @param url_transformer - Function to transform the URLs.
 * @param format_filter - Function to filter the formats.
 * @returns DASH manifest
 */
  toDash(url_transformer?: URLTransformer, format_filter?: FormatFilter): string {
    return FormatUtils.toDash(this.streaming_data, url_transformer, format_filter, this.#cpn, this.#actions.session.player);
  }

  /**
   * Selects the format that best matches the given options.
   * @param options - Options
   */
  chooseFormat(options: FormatOptions): Format {
    return FormatUtils.chooseFormat(options, this.streaming_data);
  }

  /**
   * Downloads the video.
   * @param options - Download options.
   */
  async download(options: DownloadOptions = {}): Promise<ReadableStream<Uint8Array>> {
    return FormatUtils.download(options, this.#actions, this.playability_status, this.streaming_data, this.#actions.session.player);
  }

  /**
   * Retrieves contents of the given tab.
   */
  async getTab(title_or_page_type: string): Promise<ObservedArray<YTNode> | SectionList | MusicQueue | RichGrid | Message> {
    if (!this.tabs)
      throw new InnertubeError('Could not find any tab');

    const target_tab =
      this.tabs.get({ title: title_or_page_type }) ||
      this.tabs.matchCondition((tab) => tab.endpoint.payload.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === title_or_page_type) ||
      this.tabs?.[0];

    if (!target_tab)
      throw new InnertubeError(`Tab "${title_or_page_type}" not found`, { available_tabs: this.available_tabs });

    if (target_tab.content)
      return target_tab.content;

    const page = await target_tab.endpoint.call(this.#actions, { client: 'YTMUSIC', parse: true });

    if (page.contents?.item().key('type').string() === 'Message')
      return page.contents.item().as(Message);

    if (!page.contents)
      throw new InnertubeError('Page contents was empty', page);

    return page.contents.item().as(SectionList).contents;
  }

  /**
   * Retrieves up next.
   */
  async getUpNext(automix = true): Promise<PlaylistPanel> {
    const music_queue = await this.getTab('Up next') as MusicQueue;

    if (!music_queue || !music_queue.content)
      throw new InnertubeError('Music queue was empty, the video id is probably invalid.', music_queue);

    const playlist_panel = music_queue.content.as(PlaylistPanel);

    if (!playlist_panel.playlist_id && automix) {
      const automix_preview_video = playlist_panel.contents.firstOfType(AutomixPreviewVideo);

      if (!automix_preview_video)
        throw new InnertubeError('Automix item not found');

      const page = await automix_preview_video.playlist_video?.endpoint.call(this.#actions, {
        videoId: this.basic_info.id,
        client: 'YTMUSIC',
        parse: true
      });

      if (!page || !page.contents_memo)
        throw new InnertubeError('Could not fetch automix');

      return page.contents_memo.getType(PlaylistPanel)?.[0];
    }

    return playlist_panel;
  }

  /**
   * Retrieves related content.
   */
  async getRelated(): Promise<ObservedArray<MusicCarouselShelf | MusicDescriptionShelf>> {
    const tab = await this.getTab('MUSIC_PAGE_TYPE_TRACK_RELATED') as ObservedArray<MusicDescriptionShelf | MusicDescriptionShelf>;
    return tab;
  }

  /**
   * Retrieves lyrics.
   */
  async getLyrics(): Promise<MusicDescriptionShelf | undefined> {
    const tab = await this.getTab('MUSIC_PAGE_TYPE_TRACK_LYRICS') as ObservedArray<MusicCarouselShelf | MusicDescriptionShelf>;
    return tab.firstOfType(MusicDescriptionShelf);
  }

  /**
   * Adds the song to the watch history.
   */
  async addToWatchHistory(): Promise<Response> {
    if (!this.#playback_tracking)
      throw new InnertubeError('Playback tracking not available');

    const url_params = {
      cpn: this.#cpn,
      fmt: 251,
      rtn: 0,
      rt: 0
    };

    const url = this.#playback_tracking.videostats_playback_url.replace('https://s.', 'https://music.');

    const response = await this.#actions.stats(url, {
      client_name: Constants.CLIENTS.YTMUSIC.NAME,
      client_version: Constants.CLIENTS.YTMUSIC.VERSION
    }, url_params);

    return response;
  }

  get available_tabs(): string[] {
    return this.tabs ? this.tabs.map((tab) => tab.title) : [];
  }

  get page(): [IPlayerResponse, INextResponse?] {
    return this.#page;
  }
}

export default TrackInfo;