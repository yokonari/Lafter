import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminTabsLayout } from "../../components/AdminTabsLayout";
import { ComedianForm } from "../_components/ComedianForm";

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

export default async function NewComedianPage() {
  // 認証チェック
  const authenticated = await hasValidAdminSession();
  if (!authenticated) {
    redirect("/admin");
  }

  return (
    <AdminTabsLayout activeTab="comedians">
      <ComedianForm comedian={null} />
    </AdminTabsLayout>
  );
}
