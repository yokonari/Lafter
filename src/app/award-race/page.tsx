import { redirect } from "next/navigation";

// 賞レースページも動的レンダリングを強制します。
export const dynamic = "force-dynamic";

export default function AwardRacePage() {
    // 古い /award-race ルートからデフォルトの賞レースページにリダイレクト
    redirect("/award-race/m1/2025");
}
