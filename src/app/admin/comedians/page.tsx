import { headers } from "next/headers";
import type { Metadata } from "next";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import { ComedianAdminSection } from "./ComedianAdminSection";
import styles from "../adminTheme.module.scss";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Lafter 芸人管理",
};

type ComedianRow = {
  id: number;
  slug: string;
  name: string;
  kana: string | null;
  startedOn: string | null;
  agencyId: string;
  agencyName: string;
  styles: string[];
  channelCount: number;
  createdAt: string;
  updatedAt: string;
};

type AdminComediansResponse = {
  comedians: ComedianRow[];
  page: number;
  limit: number;
  hasNext: boolean;
  totalCount: number;
};

// 管理画面セッションの有効性を確認します。
async function hasValidAdminSession(): Promise<boolean> {
  const headerList = await headers();
  const protocol =
    headerList.get("x-forwarded-proto") ??
    headerList.get("x-forwarded-protocol") ??
    "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");

  if (!host) {
    return false;
  }

  const url = new URL("/api/auth/session", `${protocol}://${host}`);

  const cookieHeader = headerList.get("cookie");
  const authorizationHeader = headerList.get("authorization");
  const userAgentHeader = headerList.get("user-agent");

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
        ...(userAgentHeader ? { "user-agent": userAgentHeader } : {}),
      },
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as { session?: unknown } | null;
    return Boolean(payload?.session);
  } catch {
    return false;
  }
}

// API から管理画面用の芸人一覧を取得します。
async function fetchAdminComedians(
  page: number,
): Promise<AdminComediansResponse> {
  const headerList = await headers();
  const protocol =
    headerList.get("x-forwarded-proto") ??
    headerList.get("x-forwarded-protocol") ??
    "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");

  if (!host) {
    throw new Error("ホスト情報を取得できませんでした。");
  }

  const url = new URL("/api/admin/comedians", `${protocol}://${host}`);
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }

  // 認証済みの Cookie などを引き継ぎ、API 側の認可を通過します。
  const cookieHeader = headerList.get("cookie");
  const authorizationHeader = headerList.get("authorization");
  const userAgentHeader = headerList.get("user-agent");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
      ...(userAgentHeader ? { "user-agent": userAgentHeader } : {}),
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
        : `芸人一覧の取得に失敗しました。(HTTP ${response.status})`;
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
    !("comedians" in payload) ||
    !Array.isArray((payload as { comedians: unknown }).comedians) ||
    !("page" in payload) ||
    !("limit" in payload) ||
    !("hasNext" in payload)
  ) {
    throw new Error("取得した芸人一覧の形式が正しくありません。");
  }

  return payload as AdminComediansResponse;
}

type PageSearchParams = { page?: string };

type PageProps = {
  searchParams?: Promise<PageSearchParams | undefined>;
};

export default async function AdminComediansPage({ searchParams }: PageProps) {
  // 認証チェック
  const authenticated = await hasValidAdminSession();
  if (!authenticated) {
    redirect("/admin");
  }

  // searchParams を解決します。
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawPage = resolvedSearchParams.page ? Number(resolvedSearchParams.page) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  let data: AdminComediansResponse | null = null;
  let errorMessage: string | null = null;

  try {
    data = await fetchAdminComedians(page);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "芸人一覧の取得に失敗しました。";
  }

  const comediansData = data?.comedians ?? [];
  const currentPage = data?.page ?? page;
  const hasPrev = currentPage > 1;
  const hasNext = Boolean(data?.hasNext);

  const prevPage = currentPage - 1;
  const nextPage = currentPage + 1;

  const buildHref = (pageNumber: number) => {
    const params = new URLSearchParams();
    if (pageNumber > 1) {
      params.set("page", String(pageNumber));
    }
    const query = params.toString();
    return `/admin/comedians${query ? `?${query}` : ""}`;
  };

  const prevHref = hasPrev ? buildHref(prevPage) : "#";
  const nextHref = hasNext ? buildHref(nextPage) : "#";

  return (
    <AdminTabsLayout activeTab="comedians">
      {errorMessage ? (
        <p className={styles.errorMessage}>
          {errorMessage}
        </p>
      ) : (
        <ComedianAdminSection
          initialComedians={comediansData}
          currentPage={currentPage}
          hasPrev={hasPrev}
          hasNext={hasNext}
          prevHref={prevHref}
          nextHref={nextHref}
          totalCount={data?.totalCount ?? 0}
        />
      )}
    </AdminTabsLayout>
  );
}
