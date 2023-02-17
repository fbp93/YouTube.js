import Parser from '../index.ts';
import Text from './misc/Text.ts';
import NavigationEndpoint from './NavigationEndpoint.ts';
import MusicResponsiveListItem from './MusicResponsiveListItem.ts';

import { YTNode } from '../helpers.ts';
import Button from './Button.ts';

class MusicShelf extends YTNode {
  static type = 'MusicShelf';

  title: Text;
  contents;
  endpoint?: NavigationEndpoint;
  continuation?: string;
  bottom_text?: Text;
  bottom_button?: Button | null;
  subheaders?: Array<any>;

  constructor(data: any) {
    super();
    this.title = new Text(data.title);
    this.contents = Parser.parseArray<MusicResponsiveListItem>(data.contents, MusicResponsiveListItem);

    if (data.bottomEndpoint) {
      this.endpoint = new NavigationEndpoint(data.bottomEndpoint);
    }

    if (data.continuations) {
      this.continuation =
        data.continuations?.[0].nextContinuationData?.continuation ||
        data.continuations?.[0].reloadContinuationData?.continuation;
    }

    if (data.bottomText) {
      this.bottom_text = new Text(data.bottomText);
    }

    if (data.bottomButton) {
      this.bottom_button = Parser.parseItem<Button>(data.bottomButton);
    }

    if (data.subheaders) {
      this.subheaders = Parser.parseArray(data.subheaders);
    }
  }
}

export default MusicShelf;