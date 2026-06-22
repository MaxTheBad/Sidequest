"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { dispatchAppEvent } from "@/lib/app-brand";

export default function CreatePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
    if (typeof window !== "undefined") {
      dispatchAppEvent("open-create");
    }
  }, [router]);
  return (
    <main className="page-shell min-h-screen p-4" aria-busy="true" aria-label="Opening quest creator">
      <section className="mx-auto max-w-2xl rounded-3xl border bg-white p-6 sm:p-10">
        <div className="space-y-4">
          <div className="skeleton h-5 w-28" />
          <div className="skeleton h-10 w-3/4" />
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      </section>
    </main>
  );
}
