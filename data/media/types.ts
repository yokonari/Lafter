// 全芸人の検索対象に含める共通チャンネルを管理します。
export type MediaChannel = {
  channelId: string;
  name?: string;
};

export type MediaChannels = {
  media: MediaChannel[];
};
