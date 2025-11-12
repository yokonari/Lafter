export function UserFooter() {
  return (
    <footer className="mt-16 bg-gray-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-600">
          <a href="#" className="transition hover:text-gray-900">
            問い合わせ
          </a>
          <a href="#" className="transition hover:text-gray-900">
            利用規約
          </a>
          <a href="#" className="transition hover:text-gray-900">
            プライバシーポリシー
          </a>
        </div>
        <p className="mt-4 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Lafter. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
