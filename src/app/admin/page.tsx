import type { Metadata } from "next";
import { AdminLoginForm } from "./_components/AdminLoginForm";

export const metadata: Metadata = {
  title: "Lafter 管理画面",
};

export default function AdminLoginPage() {
  return <AdminLoginForm />;
}
