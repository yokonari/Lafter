import Link from "next/link";
import { headers } from "next/headers";

type AdminVideo = {
  id: string;
  url: string;
  title: string;
  channel_name: string;
  is_registered_channel: number;
};

type AdminVideosResponse = {
  videos: AdminVideo[];
  page: number;
};

const PAGE_LIMIT = 50;

// API から管理画面用の動画一覧を丁寧に取り出します。
async function fetchAdminVideos(page: number): Promise<AdminVideosResponse> {
  const headerList = await headers();
  const protocol =
    (await headerList).get("x-forwarded-proto") ??
    (await headerList).get("x-forwarded-protocol") ??
    "http";
  const host = (await headerList).get("x-forwarded-host") ?? (await headerList).get("host");

  if (!host) {
    throw new Error("ホスト情報を取得できませんでした。");
  }

  const url = new URL("/api/admin/videos", `${protocol}://${host}`);
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }

  // 認証済みのCookieを丁寧に引き継ぎ、API側の認証チェックを通過します。
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
        : `動画一覧の取得に失敗しました。(HTTP ${response.status})`;
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
    !("videos" in payload) ||
    !Array.isArray((payload as { videos: unknown }).videos) ||
    !("page" in payload)
  ) {
    throw new Error("取得した動画一覧の形式が正しくありません。");
  }

  return payload as AdminVideosResponse;
}

type PageSearchParams = { page?: string };

type PageProps = {
  searchParams?: PageSearchParams | Promise<PageSearchParams>;
};

export default async function AdminVideosPage({ searchParams }: PageProps) {
  // Next.js の Promise 化された searchParams に丁寧に対応します。
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawPage = resolvedSearchParams.page ? Number(resolvedSearchParams.page) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  let data: AdminVideosResponse | null = null;
  let errorMessage: string | null = null;

  try {
    // 指定ページの動画一覧を丁寧に読み込み、管理者へご案内します。
    data = await fetchAdminVideos(page);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "動画一覧の取得に失敗しました。";
  }

  const videos = data?.videos ?? [];
  const currentPage = data?.page ?? page;
  const hasPrev = currentPage > 1;
  const hasNext = videos.length === PAGE_LIMIT;

  const prevPage = currentPage - 1;
  const nextPage = currentPage + 1;

  const prevHref = hasPrev ? `/admin/videos${prevPage > 1 ? `?page=${prevPage}` : ""}` : "#";
  const nextHref = hasNext ? `/admin/videos?page=${nextPage}` : "#";

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">管理者用動画一覧</h1>
          <p className="text-sm text-slate-600">
            取得対象は登録ステータスが保留の動画です。認証済みでない場合はログイン画面へ戻されます。
          </p>
        </div>

        {errorMessage ? (
          <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                    動画タイトル
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                    チャンネル
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                    ステータス
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                    YouTube
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {videos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      表示できる動画がありません。
                    </td>
                  </tr>
                ) : (
                  videos.map((video) => (
                    <tr key={video.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{video.title}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {video.channel_name || "チャンネル未登録"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {video.is_registered_channel === 0 ? "未登録" : "登録済み"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-900 underline underline-offset-4 hover:text-slate-700"
                        >
                          開く
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-slate-600">ページ {currentPage}</span>
          <div className="flex gap-2">
            {hasPrev ? (
              <Link
                href={prevHref}
                prefetch={false}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
              >
                前のページ
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded border border-slate-200 px-3 py-2 text-sm text-slate-300">
                前のページ
              </span>
            )}
            {hasNext ? (
              <Link
                href={nextHref}
                prefetch={false}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
              >
                次のページ
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded border border-slate-200 px-3 py-2 text-sm text-slate-300">
                次のページ
              </span>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
