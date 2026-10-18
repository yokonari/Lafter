import { redirect } from "next/navigation";
import { getLatestAwardRace } from "@data/award-races/types";

// 賞レースページも動的レンダリングを強制します。
export const dynamic = "force-dynamic";

export default function AwardRacePage() {
    // 登録済みの最新結果を初期表示する。
    const { race, year } = getLatestAwardRace();
    redirect(`/award-race/${race}/${year}`);
}
