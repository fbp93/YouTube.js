import { YTNode, type ObservedArray } from '../helpers.ts';
import Parser, { type RawNode } from '../index.ts';
import ItemSectionTab from './ItemSectionTab.ts';
import Text from './misc/Text.ts';

export default class ItemSectionTabbedHeader extends YTNode {
  static type = 'ItemSectionTabbedHeader';

  title: Text;
  tabs: ObservedArray<ItemSectionTab>;
  end_items?: ObservedArray<YTNode>;

  constructor(data: RawNode) {
    super();
    this.title = new Text(data.title);
    this.tabs = Parser.parseArray(data.tabs, ItemSectionTab);
    if (Reflect.has(data, 'endItems')) {
      this.end_items = Parser.parseArray(data.endItems);
    }
  }
}