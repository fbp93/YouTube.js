import { YTNode } from '../helpers.ts';
import Parser, { type RawNode } from '../index.ts';

export default class SingleColumnMusicWatchNextResults extends YTNode {
  static type = 'SingleColumnMusicWatchNextResults';

  contents;

  constructor(data: RawNode) {
    super();
    this.contents = Parser.parse(data);
  }
}