"use client";

import Link from "next/link";
import { Bounce, ToastContainer } from "react-toastify";
import { Video, Component, UserRound, LogOut } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";
import styles from "../adminTheme.module.scss";

type AdminTabsLayoutProps = {
  activeTab: "videos" | "channels" | "comedians";
  children: React.ReactNode;
};

const TAB_ITEMS = [
  { key: "videos", icon: Video, label: "動画", href: "/admin/videos" },
  { key: "channels", icon: Component, label: "チャンネル", href: "/admin/channels" },
  { key: "comedians", icon: UserRound, label: "芸人", href: "/admin/comedians" },
] as const;

export function AdminTabsLayout({ activeTab, children }: AdminTabsLayoutProps) {
  const handleSignOut = async () => {
    // Better Auth の標準ルートでサーバー側セッションを確実に破棄します。
    await fetch("/api/auth/sign-out", { method: "POST" });
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
