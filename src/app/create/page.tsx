"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreatePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sidequest:open-create"));
    }
  }, [router]);
  return null;
}
