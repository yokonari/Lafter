import type { Metadata } from "next";
import { Suspense } from "react";
import AdminVideosPageContent from "./_components/AdminVideosPageContent";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import styles from "../adminTheme.module.scss";

export const metadata: Metadata = {
  title: "Lafter 動画管理",
};

export default function AdminVideosPage() {
  return (
    <Suspense
      fallback={
        <AdminTabsLayout activeTab="videos">
          <p className={styles.feedbackCard}>
            画面を読み込んでいます…
          </p>
        </AdminTabsLayout>
      }
    >
      <AdminVideosPageContent />
    </Suspense>
  );
}
