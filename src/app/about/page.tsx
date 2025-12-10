import type { Metadata } from "next";
import { AboutPage } from "@/components/user/AboutPage";

export const metadata: Metadata = {
    title: "このサイトについて | Lafter",
    description: "Lafterの概要、制作者情報、応援方法についてご紹介します。",
};

export default function AboutRoute() {
    return <AboutPage />;
}
