import { useEffect, useState } from "react";

type BackendHealth = {
  ok: boolean;
  version?: string;
  mode?: string;
  security?: {
    edgeFunctionActive?: boolean;
    cloudflareAccessHeaderDetected?: boolean;
    cloudflareAccessJwtPresent?: boolean;
    authenticatedUserMasked?: string | null;
  };
  locks?: {
    paidApiEnabled?: boolean;
    commandExecutionEnabled?: boolean;
    fileWriteEnabled?: boolean;
    deployExecutionEnabled?: boolean;
  };
};

type HealthStatus = "checking" | "online" | "offline";

export function BackendHealthBadge() {
  const [status, setStatus] = useState<HealthStatus>("checking");
  const [health, setHealth] = useState<BackendHealth | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHealth() {
      try {
        const response = await fetch("/api/health", {
          method: "GET",
          cache: "no-store",
          headers: {
            accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Health endpoint returned ${response.status}`);
        }

        const payload = (await response.json()) as BackendHealth;

        if (!active) {
          return;
        }

        setHealth(payload);
        setStatus(payload.ok ? "online" : "offline");
      } catch {
        if (!active) {
          return;
        }

        setHealth(null);
        setStatus("offline");
      }
    }

    loadHealth();

    return () => {
      active = false;
    };
  }, []);

  const label =
    status === "checking"
      ? "edge: verificando"
      : status === "online"
        ? "edge: online"
        : "edge: offline";

  const title =
    status === "online"
      ? `ARGOS backend ativo ${health?.version || ""}. API paga bloqueada. Executor bloqueado.`
      : "ARGOS backend ainda nao respondeu neste ambiente.";

  return (
    <span className={`backend-health backend-health-${status}`} title={title}>
      {label}
    </span>
  );
}
