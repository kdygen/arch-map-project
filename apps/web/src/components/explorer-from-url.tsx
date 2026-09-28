"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { MapsConfig } from "@/lib/config";
import { parseFilters } from "@/lib/filters/url";

import { Explorer } from "./explorer";

/**
 * Reads the filters in the page address once, when the page opens.
 * After that the Explorer owns the state and writes it back to the address.
 */
export function ExplorerFromUrl({ config }: { config: MapsConfig }) {
  const searchParams = useSearchParams();
  const [initialFilters] = useState(() =>
    parseFilters(new URLSearchParams(searchParams.toString())),
  );
  return <Explorer config={config} initialFilters={initialFilters} />;
}
