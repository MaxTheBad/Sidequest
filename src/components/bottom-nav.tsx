"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-white/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-2 grid grid-cols-4 items-end">
        <Link href="/" className={`text-center text-xs py-2 ${isActive("/") ? "font-semibold" : "text-gray-600"}`}>
          <div>🏠</div>
          <div>Home</div>
        </Link>

        <Link href="/inbox" className={`text-center text-xs py-2 ${isActive("/inbox") ? "font-semibold" : "text-gray-600"}`}>
          <div>📥</div>
          <div>Inbox</div>
        </Link>

        <Link href="/?create=1" className="text-center -mt-6">
          <div className="mx-auto h-12 w-12 rounded-full bg-black text-white grid place-items-center text-2xl leading-none">+</div>
          <div className="text-[11px] mt-1 text-gray-700">Create</div>
        </Link>

        <Link href="/settings" className={`text-center text-xs py-2 ${isActive("/settings") ? "font-semibold" : "text-gray-600"}`}>
          <div>⚙️</div>
          <div>Settings</div>
        </Link>
      </div>
    </nav>
  );
}
