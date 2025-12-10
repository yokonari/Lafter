import type { Metadata } from "next";
import { ContactPage } from "@/components/user/ContactPage";

export const metadata: Metadata = {
    title: "お問い合わせ | Lafter",
    description: "Lafterへのお問い合わせはこちらから。ご質問やご要望をお寄せください。",
};

export default function ContactRoute() {
    return <ContactPage />;
}
