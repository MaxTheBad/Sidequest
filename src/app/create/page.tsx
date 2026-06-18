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
  return null;
}
