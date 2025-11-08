import { headers } from "next/headers";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import { ChannelAdminSection } from "./ChannelAdminSection";

type AdminChannel = {
  id: string;
  url: string;
  name: string;
  status: number;
  keyword?: string;
  latestVideoTitle?: string | null;
  latestVideoId?: string | null;
};

type AdminChannelsResponse = {
  channels: AdminChannel[];
  page: number;
  limit: number;
  hasNext: boolean;
};

// API から管理画面用のチャンネル一覧を丁寧に取り出します。
async function fetchAdminChannels(page: number, channelStatus: number): Promise<AdminChannelsResponse> {
  const headerList = await headers();
  const protocol =
    (await headerList).get("x-forwarded-proto") ??
    (await headerList).get("x-forwarded-protocol") ??
    "http";
  const host = (await headerList).get("x-forwarded-host") ?? (await headerList).get("host");

  if (!host) {
    throw new Error("ホスト情報を取得できませんでした。");
  }

  const url = new URL("/api/admin/channels", `${protocol}://${host}`);
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  url.searchParams.set("channel_status", String(channelStatus));

  // 認証済みの Cookie などを丁寧に引き継ぎ、API 側の認可を通過します。
  const cookieHeader = headerList.get("cookie");
  const authorizationHeader = headerList.get("authorization");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const defaultMessage =
      response.status === 401
        ? "ログインの有効期限が切れています。お手数ですが再度ログインしてください。"
        : `チャンネル一覧の取得に失敗しました。(HTTP ${response.status})`;
    const message =
      payload &&
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof (payload as { message?: string }).message === "string"
        ? (payload as { message?: string }).message
        : defaultMessage;
    throw new Error(message);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("channels" in payload) ||
    !Array.isArray((payload as { channels: unknown }).channels) ||
    !("page" in payload) ||
    !("limit" in payload) ||
    !("hasNext" in payload)
  ) {
    throw new Error("取得したチャンネル一覧の形式が正しくありません。");
  }

  const raw = payload as {
    channels: Array<{
      id: string;
      url: string;
      name: string;
      status: number;
      keyword?: string | null;
      latest_video_title?: string | null;
      latest_video_id?: string | null;
    }>;
    page: number;
    limit: number;
    hasNext: boolean;
  };

  const channels = raw.channels.map((channel) => ({
    id: channel.id,
    url: channel.url,
    name: channel.name,
    status: channel.status,
    keyword: channel.keyword ?? undefined,
    latestVideoTitle: channel.latest_video_title ?? null,
    latestVideoId: channel.latest_video_id ?? null,
  }));

  return {
    channels,
    page: raw.page,
    limit: raw.limit,
    hasNext: raw.hasNext,
  };
}

type PageSearchParams = { page?: string; channel_status?: string };

// Next.js 側で Promise として渡される searchParams に丁寧に合わせます。
type PageProps = {
  searchParams?: Promise<PageSearchParams | undefined>;
};

export default async function AdminChannelsPage({ searchParams }: PageProps) {
  // 動的に渡される searchParams を丁寧に解決します。
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawPage = resolvedSearchParams.page ? Number(resolvedSearchParams.page) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const rawChannelStatus = resolvedSearchParams.channel_status
    ? Number(resolvedSearchParams.channel_status)
    : defaultChannelStatus;
  // channel_status クエリを丁寧に解釈し、登録済みフィルターの切り替えに備えます。
  const channelStatusFilter =
    Number.isFinite(rawChannelStatus) && rawChannelStatus >= 0
      ? Math.floor(rawChannelStatus)
      : defaultChannelStatus;

  let data: AdminChannelsResponse | null = null;
  let errorMessage: string | null = null;

  try {
    // 指定ページのチャンネル一覧を丁寧に取得し、管理者へご案内します。
    data = await fetchAdminChannels(page, channelStatusFilter);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "チャンネル一覧の取得に失敗しました。";
  }

  const channelsData = data?.channels ?? [];
  const currentPage = data?.page ?? page;
  const hasPrev = currentPage > 1;
  const hasNext = Boolean(data?.hasNext);

  const prevPage = currentPage - 1;
  const nextPage = currentPage + 1;
  // ページングリンクにもフィルター条件を丁寧に付与します。
  const buildHref = (pageNumber: number) => {
    const params = new URLSearchParams();
    if (pageNumber > 1) {
      params.set("page", String(pageNumber));
    }
    if (channelStatusFilter !== defaultChannelStatus) {
      params.set("channel_status", String(channelStatusFilter));
    }
    const query = params.toString();
    return `/admin/channels${query ? `?${query}` : ""}`;
  };

  const prevHref = hasPrev ? buildHref(prevPage) : "#";
  const nextHref = hasNext ? buildHref(nextPage) : "#";

  return (
    <AdminTabsLayout activeTab="channels">
      {errorMessage ? (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : (
        <ChannelAdminSection
          initialChannels={channelsData}
          currentPage={currentPage}
          hasPrev={hasPrev}
          hasNext={hasNext}
          prevHref={prevHref}
          nextHref={nextHref}
          channelStatus={channelStatusFilter}
        />
      )}
    </AdminTabsLayout>
  );
}
const defaultChannelStatus = 0;
