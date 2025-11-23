import React from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./userTheme.module.scss";

interface MarkdownPageLayoutProps {
    markdownContent: string;
}

export default function MarkdownPageLayout({ markdownContent }: MarkdownPageLayoutProps) {
    const markdownComponents = {
        h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h1 className={styles.termsHeading1} {...props} />
        ),
        h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h2 className={styles.termsHeading2} {...props} />
        ),
        h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h3 className={styles.termsHeading3} {...props} />
        ),
        p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
            <p className={styles.termsParagraph} {...props} />
        ),
        ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
            <ul className={styles.termsList} {...props} />
        ),
        ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
            <ol className={styles.termsList} {...props} />
        ),
        li: (props: React.HTMLAttributes<HTMLLIElement>) => (
            <li className={styles.termsListItem} {...props} />
        ),
        strong: (props: React.HTMLAttributes<HTMLElement>) => (
            <strong className={styles.termsStrong} {...props} />
        ),
        a: (props: React.HTMLAttributes<HTMLAnchorElement>) => (
            <a className={styles.termsLink} {...props} />
        ),
    };

    return (
        <main className={styles.termsLayout} style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className={styles.termsBackWrap}>
                <Link href="/" className={styles.termsBackLink}>
                    <ArrowLeft aria-hidden="true" size={20} className={styles.termsBackIcon} />
                    <span>トップへ戻る</span>
                </Link>
            </div>
            <div className={styles.termsCard}>
                <div className={styles.termsScrollArea}>
                    <div className={styles.termsArticle}>
                        <ReactMarkdown components={markdownComponents}>{markdownContent}</ReactMarkdown>
                    </div>
                </div>
            </div>
        </main>
    );
}
