// 賞レースデータの型定義

// 決勝進出者（1-10位）
export interface Finalist {
    rank: number; // 順位（1-10）
    name: string; // 芸人名
}

// 年度別データ
export interface YearData {
    finalists: Finalist[]; // 決勝進出者（1-10位）
    semifinalists: string[]; // 準決勝進出者（11-30位）
    quarterfinalists: string[]; // 準々決勝進出者（31-50位）
}

// 賞レース別データ
export interface RaceData {
    [year: string]: YearData;
}

// 全体のデータ構造
export interface AwardRacesData {
    m1: RaceData; // M-1グランプリ
    koc: RaceData; // キングオブコント
}

// 賞レースの種類
export type RaceType = 'm1' | 'koc';

// 賞レース名の表示用マッピング
export const RACE_NAMES: Record<RaceType, string> = {
    m1: 'M-1グランプリ',
    koc: 'キングオブコント',
};

// 利用可能な年度リスト（2020-2025）
export const AVAILABLE_YEARS = [2025, 2024, 2023, 2022, 2021, 2020];
