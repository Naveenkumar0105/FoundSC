import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-bold">Lost something? Found something?</h1>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/found/new" className="flex min-h-32 flex-col justify-between rounded-2xl bg-cardinal p-4 text-white shadow-sm hover:bg-cardinal-dark">
          <span className="text-3xl" aria-hidden>📷</span>
          <span className="text-lg font-semibold">I found something</span>
        </Link>
        <Link href="/lost/new" className="flex min-h-32 flex-col justify-between rounded-2xl border-2 border-cardinal bg-white p-4 text-cardinal shadow-sm hover:bg-red-50">
          <span className="text-3xl" aria-hidden>🔎</span>
          <span className="text-lg font-semibold">I lost something</span>
        </Link>
      </div>
      <p className="text-xs text-stone-500">USC email required.</p>
    </div>
  );
}
