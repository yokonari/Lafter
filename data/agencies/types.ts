// 事務所とチャンネルIDの関連付けを管理します。
export type AgencyChannel = {
  channelId: string;
  name: string;
};

export type AgencyData = {
  name: string;
  channels: AgencyChannel[];
};

export type AgenciesById = {
  agency: Record<string, AgencyData>;
};
