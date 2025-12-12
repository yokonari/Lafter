"use client";

import Link from "next/link";
import { useMemo } from "react";
import { createAuthClient } from "better-auth/react";
import type { ClientOptions } from "better-auth/types";
import { Bounce, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "../adminTheme.module.scss";

type AdminTabsLayoutProps = {
  activeTab: "videos" | "channels" | "playlists";
  children: React.ReactNode;
};

const TAB_ITEMS: Array<{ key: "videos" | "channels" | "playlists"; name: string; href: string }> = [
  { key: "videos", name: "動画", href: "/admin/videos" },
  { key: "channels", name: "チャンネル", href: "/admin/channels" },
  { key: "playlists", name: "プレイリスト", href: "/admin/playlists" },
];

export function AdminTabsLayout({ activeTab, children }: AdminTabsLayoutProps) {
  const authClient = useMemo(() => {
    const client = createAuthClient<ClientOptions>({
      baseURL: typeof window === "undefined" ? undefined : `${window.location.origin}/api/auth`,
    });
    return client as typeof client & {
      signOut: () => Promise<{ data?: unknown; error?: unknown }>;
    };
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/admin";
  };

  // 管理画面は常にダークトーンで統一する方針のため、ここでテーマ分岐を排除しています。
  return (
    <main className={styles.adminLayout}>
      <ToastContainer
        position="top-right"
        autoClose={5000}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="dark"
        transition={Bounce}
      />
      <section className={styles.layoutBody}>
        <div className={styles.tabBar}>
          {TAB_ITEMS.map((tab) => {
            const isActive = tab.key === activeTab;
            // アクティブ状態に応じてCSSモジュールのクラスを丁寧に切り替え、視認性を確保します。
            const tabClassName = `${styles.tabItem} ${isActive ? styles.tabItemActive : styles.tabItemInactive
              }`;

            return (
              <Link key={tab.key} href={tab.href} prefetch={false} className={tabClassName}>
                {tab.name}
              </Link>
            );
          })}
          <button
            type="button"
            className={`${styles.tabItem} ${styles.tabItemInactive}`}
            onClick={handleSignOut}
            style={{
              marginLeft: "auto",
              backgroundColor: "transparent",
              borderTop: "none",
              borderRight: "none",
              borderLeft: "none",
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </div>

        {children}
      </section>
    </main>
  );
}
