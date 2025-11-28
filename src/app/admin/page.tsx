import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "./_components/AdminLoginForm";

export const metadata: Metadata = {
  title: "Lafter 管理画面",
};

// 認証セッションの有無を Cloudflare 実行環境を経由して丁寧に確認します。
async function hasValidAdminSession() {
  try {
    const headerList = headers();
    const protocol =
      headerList.get("x-forwarded-proto") ??
      headerList.get("x-forwarded-protocol") ??
      "http";
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    if (!host) {
      return false;
    }
    const cookieHeader = headerList.get("cookie");
    const url = new URL("/api/auth/session", `${protocol}://${host}`);
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || !("session" in payload)) {
      return false;
    }
    const session = (payload as { session?: unknown }).session;
    return typeof session === "object" && session !== null;
  } catch {
    return false;
  }
}

export default async function AdminLoginPage() {
  const authenticated = await hasValidAdminSession();
  if (authenticated) {
    // 既に認証済みであれば動画管理タブへ素早く誘導し、再入力の手間を省きます。
    redirect("/admin/videos");
  }
  return <AdminLoginForm />;
}
