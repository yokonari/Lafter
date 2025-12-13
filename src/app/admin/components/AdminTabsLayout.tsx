"use client";

import Link from "next/link";
import { useMemo } from "react";
import { createAuthClient } from "better-auth/react";
import type { ClientOptions } from "better-auth/types";
import { Bounce, ToastContainer } from "react-toastify";
import { Video, User, ListVideo, LogOut } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";
import styles from "../adminTheme.module.scss";

type AdminTabsLayoutProps = {
  activeTab: "videos" | "channels" | "playlists";
  children: React.ReactNode;
};

const TAB_ITEMS = [
  { key: "videos", icon: Video, label: "動画", href: "/admin/videos" },
  { key: "channels", icon: User, label: "チャンネル", href: "/admin/channels" },
  { key: "playlists", icon: ListVideo, label: "プレイリスト", href: "/admin/playlists" },
] as const;

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

            const Icon = tab.icon;

            return (
              <Link
                key={tab.key}
                href={tab.href}
                prefetch={false}
                className={tabClassName}
                aria-label={tab.label}
              >
                <Icon size={24} />
              </Link>
            );
          })}
          <button
            type="button"
            className={`${styles.tabItem} ${styles.tabItemInactive}`}
            onClick={handleSignOut}
            aria-label="ログアウト"
            style={{
              marginLeft: "auto",
              backgroundColor: "transparent",
              borderTop: "none",
              borderRight: "none",
              borderLeft: "none",
              cursor: "pointer",
            }}
          >
            <LogOut size={24} />
          </button>
        </div>

        {children}
      </section>
    </main>
  );
}
