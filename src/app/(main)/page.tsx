"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { defaultPageRoute } from "@/lib/default-page.client";

/**
 * App entry route. Myra has no standalone "home" view anymore — startup lands on
 * the page the user picked in Settings → Preferences → Default Page
 * (Operations / Patrols / History), resolved app-locally. Redirect immediately.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(defaultPageRoute());
  }, [router]);

  return null;
}
