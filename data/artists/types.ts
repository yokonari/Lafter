export type ArtistChannel = {
  channelId: string;
  role: string;
  description?: string; // UIで使わない補足情報を保持します。
};

export type Artist = {
  slug: string;
  name: string;
  kana?: string; // 五十音順ソート用の読み仮名（ひらがな）
  colors?: string[];
  description?: string;
  startedOn?: string;
  styles?: string[];
  channels: ArtistChannel[];
};

export type AgencyArtistGroup = {
  artists: Artist[];
};

export type ArtistsByAgency = {
  agency: Record<string, AgencyArtistGroup>;
};

export type ArtistWithAgency = Artist & {
  agencyId: string;
};

export const flattenArtistsByAgency = (data: ArtistsByAgency): ArtistWithAgency[] => {
  // 事務所IDを付与しながら芸人データを配列に展開します。
  return Object.entries(data.agency).flatMap(([agencyId, group]) =>
    group.artists.map((artist) => ({
      ...artist,
      agencyId,
    })),
  );
};
