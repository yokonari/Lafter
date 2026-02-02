import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AdminTabsLayout } from "../../../components/AdminTabsLayout";
import { ComedianForm, type ComedianFormData } from "../../_components/ComedianForm";

type Props = {
  params: Promise<{ id: string }>;
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

type ComedianApiResponse = {
  comedian: {
    id: number;
    name: string;
    slug: string;
    kana: string | null;
    startedOn: string | null;
    agencyId: string;
    styles: string[];
    channels: Array<{
      channelId: string;
      role: "official" | "group";
      description?: string;
    }>;
    aliases: Array<{
      name: string;
      kana: string;
    }>;
  };
};

async function fetchComedian(id: string): Promise<ComedianFormData | null> {
  const headerList = await headers();
  const protocol =
    headerList.get("x-forwarded-proto") ??
    headerList.get("x-forwarded-protocol") ??
    "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");

  if (!host) {
    return null;
  }

  const url = new URL(`/api/admin/comedian/${id}`, `${protocol}://${host}`);

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

  if (!response.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as ComedianApiResponse | null;
  if (!data?.comedian) {
    return null;
  }

  return {
    id: data.comedian.id,
    name: data.comedian.name,
    slug: data.comedian.slug,
    kana: data.comedian.kana,
    startedOn: data.comedian.startedOn,
    agencyId: data.comedian.agencyId,
    styles: data.comedian.styles,
  };
}

export default async function EditComedianPage({ params }: Props) {
  // 認証チェック
  const authenticated = await hasValidAdminSession();
  if (!authenticated) {
    redirect("/admin");
  }

  const { id } = await params;
  const comedian = await fetchComedian(id);

  if (!comedian) {
    notFound();
  }

  return (
    <AdminTabsLayout activeTab="comedians">
      <ComedianForm comedian={comedian} />
    </AdminTabsLayout>
  );
}
