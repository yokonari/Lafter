"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { AdminTabsLayout } from "../../components/AdminTabsLayout";
import { useAdminToast } from "../../hooks/useAdminToast";
import styles from "../../adminTheme.module.scss";

export default function ChannelRegisterPage() {
    const router = useRouter();
    const [registerInput, setRegisterInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // トースト通知の統一
    useAdminToast();

    const handleRegisterSubmit = async () => {
        const ids = registerInput
            .split(/[\n,]/) // 改行またはカンマで区切ります
            .map((s) => s.trim())
            .filter((s) => s !== "");

        if (ids.length === 0) {
            toast.error("チャンネルIDを入力してください。");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch("/api/admin/channels/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channelIds: ids }),
            });

            const payload = (await response.json().catch(() => null)) as {
                message?: string;
                results?: Array<{ id: string; name: string; success: boolean; error?: string }>;
            } | null;

            if (!response.ok) {
                throw new Error(payload?.message ?? "登録に失敗しました。");
            }

            const results = payload?.results ?? [];
            const successCount = results.filter((r) => r.success).length;
            const errorCount = results.length - successCount;

            if (errorCount > 0) {
                toast.error(
                    `${successCount}件成功、${errorCount}件失敗しました。詳細はコンソールを確認してください。`
                );
                console.error("Registration errors:", results.filter((r) => !r.success));
            } else {
                toast.success(`${successCount}件のチャンネルを登録しました。`);
                setRegisterInput("");
                // 登録完了後はチャンネル一覧に戻ります
                router.push("/admin/channels");
                router.refresh();
            }
        } catch (error) {
            toast.error(
                (error as Error).message ?? "エラーが発生しました。"
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AdminTabsLayout activeTab="channels">
            <div className={styles.section}>
                <div className={styles.header}>
                    <h2 className={styles.headerTitle}>
                        チャンネル手動追加
                    </h2>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardBody}>
                        <p className={styles.registerDescription}>
                            YouTubeチャンネルIDを入力してください（改行またはカンマ区切りで複数指定可）。
                        </p>

                        <textarea
                            value={registerInput}
                            onChange={(e) => setRegisterInput(e.target.value)}
                            rows={6}
                            className={styles.registerTextArea}
                        />

                        <div className={styles.buttonRow}>
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className={styles.loginSecondaryButton}
                                disabled={isSubmitting}
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={handleRegisterSubmit}
                                className={styles.primaryButton}
                                disabled={isSubmitting || !registerInput.trim()}
                            >
                                {isSubmitting ? "登録中..." : "登録する"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </AdminTabsLayout>
    );
}
