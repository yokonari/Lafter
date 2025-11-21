import type { Metadata } from "next";
import { Suspense } from "react";
import AdminPlaylistsPageContent from "./_components/AdminPlaylistsPageContent";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import styles from "../adminTheme.module.scss";

export const metadata: Metadata = {
  title: "Lafter プレイリスト管理",
};

export default function AdminPlaylistsPage() {
  return (
    <Suspense
      fallback={
        <AdminTabsLayout activeTab="playlists">
          <p className={styles.feedbackCard}>
            画面を読み込んでいます…
          </p>
        </AdminTabsLayout>
      }
    >
      <AdminPlaylistsPageContent />
    </Suspense>
  );
}
