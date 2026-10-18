import awardRacesData from './award-races.json';

// 賞レースデータの型定義

// 決勝進出者（人数は大会・年度によって異なる）
export interface Finalist {
    rank: number; // 順位（同順位を含む）
    name: string; // 芸人名
}

// 年度別データ
export interface YearData {
    finalists: Finalist[]; // 決勝進出者（人数は大会・年度によって異なる）
    semifinalists: string[]; // 準決勝進出者（決勝進出者を除く）
    quarterfinalists: string[]; // 準々決勝進出者（準決勝進出者を除く）
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

// データが存在する年度だけを大会ごとに新しい順で返す。
export function getAvailableYears(race: RaceType): number[] {
    return Object.keys(awardRacesData[race]).map(Number).sort((a, b) => b - a);
}

// 最新年度を初期表示する。同年度なら開催時期が遅いM-1を優先する。
export function getLatestAwardRace(): { race: RaceType; year: number } {
    const races: RaceType[] = ['m1', 'koc'];
    return races
        .map((race) => ({ race, year: getAvailableYears(race)[0] }))
        .sort((a, b) => b.year - a.year)[0];
}
