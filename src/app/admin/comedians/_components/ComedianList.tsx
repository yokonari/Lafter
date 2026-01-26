"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ComedianRow } from "../ComedianAdminSection";
import { STYLE_LABELS } from "@/lib/styleLabels";
import styles from "../../adminTheme.module.scss";

type ComedianListProps = {
  comedians: ComedianRow[];
  onEdit: (comedian: ComedianRow) => void;
  onDelete: (comedian: ComedianRow) => void;
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
};

function calculateCareerYears(startedOn?: string | null): number | null {
  if (!startedOn) return null;
  const yearPart = startedOn.split("-")[0];
  const startYear = Number(yearPart);
  if (!Number.isFinite(startYear) || startYear <= 0) return null;
  const currentYear = new Date().getFullYear();
  const years = currentYear - startYear + 1;
  return years > 0 ? years : null;
}

export function ComedianList({
  comedians,
  onEdit,
  onDelete,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
}: ComedianListProps) {
  if (comedians.length === 0) {
    return (
      <p className={styles.statusText}>芸人が登録されていません。</p>
    );
  }

  return (
    <>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>芸人名</th>
              <th>読み仮名</th>
              <th>事務所</th>
              <th>芸風</th>
              <th>芸歴</th>
              <th>CH数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {comedians.map((comedian) => {
              const careerYears = calculateCareerYears(comedian.startedOn);
              return (
                <tr key={comedian.id}>
                  <td>{comedian.name}</td>
                  <td className={styles.secondaryText}>{comedian.kana ?? "-"}</td>
                  <td className={styles.secondaryText}>{comedian.agencyName}</td>
                  <td>
                    {comedian.styles.length > 0 ? (
                      <div className={styles.tagList}>
                        {comedian.styles.map((styleId) => (
                          <span key={styleId} className={styles.tag}>
                            {STYLE_LABELS[styleId] ?? styleId}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.secondaryText}>-</span>
                    )}
                  </td>
                  <td className={styles.secondaryText}>
                    {careerYears ? `${careerYears}年` : "-"}
                  </td>
                  <td className={styles.secondaryText}>
                    {comedian.channelCount > 0 ? comedian.channelCount : "-"}
                  </td>
                  <td>
                    <div className={styles.actionButtons}>
                      <button
                        type="button"
                        onClick={() => onEdit(comedian)}
                        className={styles.editButton}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(comedian)}
                        className={styles.deleteButton}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      <div className={styles.pagination}>
        <Link
          href={prevHref}
          className={`${styles.paginationButton} ${!hasPrev ? styles.paginationButtonDisabled : ""}`}
          aria-disabled={!hasPrev}
        >
          <ArrowLeft size={20} />
          <span>前へ</span>
        </Link>
        <span className={styles.paginationInfo}>ページ {currentPage}</span>
        <Link
          href={nextHref}
          className={`${styles.paginationButton} ${!hasNext ? styles.paginationButtonDisabled : ""}`}
          aria-disabled={!hasNext}
        >
          <span>次へ</span>
          <ArrowRight size={20} />
        </Link>
      </div>
    </>
  );
}
