// src/hooks/useMonth.ts
"use client";

import { useMemo, useState } from "react";

/**
 * Returns a month string "YYYY-MM".
 * Default: current month in the user's local browser time.
 */
export function useMonth(initialMonth?: string) {
  const [month, setMonth] = useState<string>(() => {
    if (initialMonth) return initialMonth;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  });

  const monthLabel = useMemo(() => {
    // Pretty label like "January 2026"
    const [y, m] = month.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [month]);

  return { month, setMonth, monthLabel };
}
