import Link from "next/link";

type AdminTabsLayoutProps = {
  activeTab: "videos" | "channels";
  children: React.ReactNode;
};

const TAB_ITEMS: Array<{ key: "videos" | "channels"; name: string; href: string }> = [
  { key: "videos", name: "動画一覧", href: "/admin/videos" },
  { key: "channels", name: "チャンネル一覧", href: "/admin/channels" },
];

export function AdminTabsLayout({ activeTab, children }: AdminTabsLayoutProps) {
  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-lg bg-white p-6 shadow">
        <div className="flex border-b border-slate-200">
          {TAB_ITEMS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              prefetch={false}
              className={`px-4 py-2 text-sm font-medium ${
                tab.key === activeTab
                  ? "border-b-2 border-slate-900 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.name}
            </Link>
          ))}
        </div>

        {children}
      </section>
    </main>
  );
}
