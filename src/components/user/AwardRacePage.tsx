'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Trophy, Crown, Medal } from 'lucide-react';

import awardRacesData from '@data/award-races/award-races.json';
import { RACE_NAMES, AVAILABLE_YEARS, type RaceType, type AwardRacesData } from '@data/award-races/types';
import { XShareButton } from './XShareButton';
import { BackToTopLink } from './BackToTopLink';
import styles from './userTheme.module.scss';

interface AwardRacePageProps {
    onBackToTop: () => void;
    onComedianSearch: (name: string) => void;
    initialRace?: RaceType;
    initialYear?: number;
}

export function AwardRacePage({ onBackToTop, onComedianSearch, initialRace, initialYear }: AwardRacePageProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // 初期値をpropsまたはデフォルト値から取得
    const [selectedRace, setSelectedRace] = useState<RaceType>(initialRace || 'm1');
    const [selectedYear, setSelectedYear] = useState<number>(initialYear || 2025);

    // initialRaceとinitialYearが変更されたときに状態を更新
    useEffect(() => {
        if (initialRace) {
            setSelectedRace(initialRace);
        }
        if (initialYear) {
            setSelectedYear(initialYear);
        }
    }, [initialRace, initialYear]);

    // データの取得
    const typedData = awardRacesData as AwardRacesData;
    const currentData = typedData[selectedRace]?.[selectedYear.toString()];

    // タブ切り替えハンドラー
    const handleRaceChange = (race: RaceType) => {
        setSelectedRace(race);
        updateUrl(race, selectedYear);
    };

    const handleYearChange = (year: number) => {
        setSelectedYear(year);
        updateUrl(selectedRace, year);
    };

    // URL更新（固定パス形式に変更）
    const updateUrl = (race: RaceType, year: number) => {
        router.push(`/award-race/${race}/${year}`);
    };

    // 芸人名クリック時の検索
    const handleComedianClick = (name: string) => {
        onComedianSearch(name);
    };

    if (!currentData) {
        return (
            <div className={styles.awardRaceContainer}>
                <p className={styles.errorMessage}>データが見つかりませんでした</p>
            </div>
        );
    }

    return (
        <div className={styles.awardRaceContainer}>
            {/* ヘッダー */}
            <div className={styles.awardRaceHeader}>
                <div className={styles.searchBackRow}>
                    <BackToTopLink onClick={onBackToTop} />
                    {/* 賞レース画面から芸人一覧へ誘導します。 */}
                    <span className={styles.searchBackSeparator}>/</span>
                    <Link href="/comedian" className={styles.searchBackLink}>
                        芸人一覧
                    </Link>
                </div>
                <div className={styles.sectionHeadingWrap}>
                    <h1 className={`${styles.searchTitle}`}>
                        賞レース出場芸人から探す
                    </h1>
                </div>
            </div>

            {/* 賞レース選択タブ（第1段階） */}
            <div className={styles.raceTabContainer}>
                <button
                    className={`${styles.raceTab} ${selectedRace === 'm1' ? styles.active : ''}`}
                    onClick={() => handleRaceChange('m1')}
                >
                    {RACE_NAMES.m1}
                </button>
                <button
                    className={`${styles.raceTab} ${selectedRace === 'koc' ? styles.active : ''}`}
                    onClick={() => handleRaceChange('koc')}
                >
                    {RACE_NAMES.koc}
                </button>
            </div>

            {/* 年度選択ドロップダウンとシェアボタン */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <div className={styles.yearSelectContainer} style={{ marginBottom: 0 }}>
                    <select
                        id="year-select"
                        value={selectedYear}
                        onChange={(e) => handleYearChange(Number(e.target.value))}
                        className={styles.yearSelect}
                    >
                        {AVAILABLE_YEARS.map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                        ))}
                    </select>
                </div>
                <div className={styles.searchHeaderShare}>
                    <XShareButton className={styles.footerInlineShareButton} />
                </div>
            </div>

            {/* コンテンツエリア */}
            <div className={styles.awardRaceContent}>
                {/* 決勝進出者（1-10位） */}
                <section className={styles.rankingSection}>
                    <h2 className={styles.sectionTitle}>
                        決勝進出者
                    </h2>
                    <div className={styles.finalistGrid}>
                        {currentData.finalists.map((finalist) => (
                            <button
                                key={`${finalist.rank}-${finalist.name}`}
                                className={`${styles.finalistCard} ${styles[`rank${finalist.rank}`]}`}
                                onClick={() => handleComedianClick(finalist.name)}
                            >
                                <div className={styles.rankBadge}>
                                    <span className={styles.rankNumber}>{finalist.rank}</span>
                                </div>
                                <div className={styles.comedianName}>{finalist.name}</div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* 準決勝進出者（11-30位） */}
                <section className={styles.listSection}>
                    <h2 className={styles.sectionTitle}>
                        準決勝進出者
                    </h2>
                    <div className={styles.comedianGrid}>
                        {currentData.semifinalists.map((name) => (
                            <button
                                key={name}
                                className={styles.comedianCard}
                                onClick={() => handleComedianClick(name)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </section>

                {/* 準々決勝進出者（31-50位） */}
                <section className={styles.listSection}>
                    <h2 className={styles.sectionTitle}>
                        準々決勝進出者
                    </h2>
                    <div className={styles.comedianGrid}>
                        {currentData.quarterfinalists.map((name) => (
                            <button
                                key={name}
                                className={styles.comedianCard}
                                onClick={() => handleComedianClick(name)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
