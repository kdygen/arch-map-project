"use client";

import { useEffect, useState } from "react";

import { getHealth } from "@/lib/api/health";

type Status = "checking" | "healthy" | "unreachable";

const LABELS: Record<Status, string> = {
  checking: "Checking…",
  healthy: "Healthy",
  unreachable: "Unreachable",
};

export function ApiStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();

    getHealth(controller.signal)
      .then(() => setStatus("healthy"))
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("unreachable");
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <p>
      API status: <strong data-testid="api-status">{LABELS[status]}</strong>
    </p>
  );
}
