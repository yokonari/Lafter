'use client';

import { CircleQuestionMark, Flag, Gift, Info, Megaphone, PlaySquare, Search, ArrowLeft } from "lucide-react";
import { Fragment, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import { toast, ToastContainer } from "react-toastify";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./userTheme.module.scss";

const userToastAppearanceOptions = {
    className: "userToast",
} as const;

// Lafter の背景や運営方針、使いかたを丁寧にまとめた説明ページです。
export function AboutPage({ onClose }: { onClose?: () => void }) {
    // Amazon eギフトの受取人アドレスを環境変数から一元管理し、表示やコピー処理の記述を丁寧にまとめます。
    const donationRecipientEmail =
        process.env.NEXT_PUBLIC_CONTACT_TO_EMAIL ?? process.env.CONTACT_TO_EMAIL ?? "yokonari10@gmail.com";

    // ダイアログではなくページとして表示するため、スクロール抑制ロジックは削除しました。

    // クリップボード API とフォールバックを用意し、クリック一度で確実にアドレスをコピーできるよう配慮します。
    const handleCopyDonationEmail = useCallback(() => {
        const notifySuccess = () => toast.success("受取人アドレスをコピーしました。", userToastAppearanceOptions);
        const notifyFailure = () => toast.error("コピーに失敗しました。手動でコピーしてください。", userToastAppearanceOptions);
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            void navigator.clipboard
                .writeText(donationRecipientEmail)
                .then(notifySuccess)
                .catch(() => notifyFailure());
            return;
        }
        if (typeof document === "undefined") {
            notifyFailure();
            return;
        }
        // clipboard API が使えない環境でも丁寧にコピーできるよう、一時的な textarea を生成して execCommand を呼び出します。
        const textarea = document.createElement("textarea");
        textarea.value = donationRecipientEmail;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            const copied = document.execCommand("copy");
            if (copied) {
                notifySuccess();
            } else {
                notifyFailure();
            }
        } catch {
            notifyFailure();
        } finally {
            document.body.removeChild(textarea);
        }
    }, [donationRecipientEmail]);

    const router = useRouter();

    const handleBack = useCallback(() => {
        if (onClose) {
            onClose();
        } else {
            router.back();
        }
    }, [onClose, router]);

    // 使いかたセクションの情報をメモ化します。
    const usageFeatures = useMemo(() => [
        {
            icon: <CircleQuestionMark size={24} className={styles.usageIcon} aria-hidden="true" />,
            title: "Lafter?",
            description:
                "お笑い芸人や劇場の公式チャンネルからネタ動画を探せる個人運営のサイトです。",
        },
        {
            icon: <Search size={24} className={styles.usageIcon} aria-hidden="true" />,
            title: "ネタ動画を探す",
            description:
                "キーワード検索でネタ動画を探せます。チャンネル名から絞り込みもできます。",
        },
        {
            icon: <PlaySquare size={24} className={styles.usageIcon} aria-hidden="true" />,
            title: "ネタ動画を観る",
            description:
                "気になったサムネイルを押すと、その場でプレイヤーが開きます。",
        },
        {
            icon: <Flag size={24} className={styles.usageIcon} aria-hidden="true" />,
            title: "報告する",
            description:
                "ネタ以外・非公式の動画は旗アイコンから報告できます。",
        },
    ], []);

    // このサイトについてセクションの情報をまとめ、描画時に並び順や内容がぶれないように丁寧にメモ化します。
    const aboutSections = useMemo<Array<{ icon: ReactNode; title: string; paragraphs: ReactNode[] }>>(
        () => [
            {
                icon: <Info size={24} className={styles.usageIcon} aria-hidden="true" />,
                title: "検索対象について",
                paragraphs: [
                    "約580チャンネル・約2.8万本の動画タイトルをAI判定＋人力チェックで掲載しています（一部のネタ漏れや誤判定があります）。",
                ],
            },
            {
                icon: <Megaphone size={24} className={styles.usageIcon} aria-hidden="true" />,
                title: "運営",
                paragraphs: [
                    <a
                        key="section-author-link"
                        href="https://x.com/lafter_day"
                        target="_blank"
                        rel="noreferrer"
                        className={styles.aboutLink}
                    >公式 X</a>,
                ],
            },
            {
                icon: <Gift size={24} className={styles.usageIcon} aria-hidden="true" />,
                title: "応援について",
                paragraphs: [
                    "応援いただけると励みになります。",
                    <a
                        key="section-support-link"
                        href="https://www.amazon.co.jp/Amazon-eGift-Card-Amazon-Logo-Animated/dp/B06X982RQ9/?gpo=300&tag=madmania-22"
                        target="_blank"
                        rel="noreferrer"
                        className={styles.aboutLink}
                    >Amazon eギフト</a>,
                    <Fragment key="section-support-email">
                        <button
                            type="button"
                            onClick={handleCopyDonationEmail}
                            className={styles.aboutCopyButton}
                            aria-label="受取人のメールアドレスをコピー"
                        >受取人のメールアドレスをコピー</button>
                    </Fragment>,
                ],
            },
        ],
        [handleCopyDonationEmail],
    );

    return (
        <motion.div
            className={styles.aboutPageLayout}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
        >
            <div className={styles.aboutPageBackWrap}>
                <button type="button" onClick={handleBack} className={styles.aboutPageBackLink}>
                    <ArrowLeft aria-hidden="true" size={20} className={styles.aboutPageBackIcon} />
                    <span>戻る</span>
                </button>
            </div>

            {/* 使いかたカード */}
            <div className={styles.aboutPageCard}>
                <div className={styles.aboutPageHeader}>
                    <h1 className={styles.aboutPageTitle}>使いかた</h1>
                </div>
                <div className={styles.aboutPageBody}>
                    {usageFeatures.map((feature) => (
                        <div key={feature.title} className={styles.usageItem}>
                            <div className={styles.usageIconWrap}>
                                {feature.icon}
                            </div>
                            <div>
                                <h2 className={styles.usageItemTitle}>{feature.title}</h2>
                                <p className={styles.usageItemDesc}>{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* このサイトについてカード */}
            <div className={styles.aboutPageCard}>
                <div className={styles.aboutPageHeader}>
                    <h2 className={styles.aboutPageSubtitle}>このサイトについて</h2>
                </div>
                <div className={styles.aboutPageBody}>
                    {aboutSections.map((section) => (
                        <section key={section.title} className={styles.aboutItem}>
                            <div className={styles.aboutIconWrap}>{section.icon}</div>
                            <div>
                                <h3 className={styles.aboutSectionTitle}>{section.title}</h3>
                                {section.paragraphs.map((paragraph, index) => (
                                    <p key={`${section.title}-${index}`} className={styles.aboutText}>
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>

            <ToastContainer position="top-center" theme="dark" />
        </motion.div>
    );
}
