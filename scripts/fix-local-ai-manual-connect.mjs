import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/MasterChatHome.tsx";
let code = readFileSync(path, "utf8");

code = code.replace(
  'const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("checking");',
  'const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("offline");'
);

const oldEffect = `  useEffect(() => {
    let active = true;

    async function loadBridge() {
      try {
        const health = await fetch(\`\${LOCAL_AI_BRIDGE_URL}/local-ai/health\`, {
          method: "GET",
          cache: "no-store",
          headers: {
            accept: "application/json",
          },
        });

        if (!health.ok) {
          throw new Error(\`Bridge health retornou \${health.status}\`);
        }

        const modelsResponse = await fetch(\`\${LOCAL_AI_BRIDGE_URL}/local-ai/models\`, {
          method: "GET",
          cache: "no-store",
          headers: {
            accept: "application/json",
          },
        });

        if (!modelsResponse.ok) {
          throw new Error(\`Bridge models retornou \${modelsResponse.status}\`);
        }

        const payload = (await modelsResponse.json()) as {
          ok: boolean;
          models: BridgeModel[];
        };

        if (!active) {
          return;
        }

        setBridgeModels(payload.models || []);
        setBridgeStatus("online");
      } catch {
        if (!active) {
          return;
        }

        setBridgeStatus("offline");
        setBridgeModels([]);
      }
    }

    loadBridge();

    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);`;

const newEffect = `  async function refreshBridge() {
    setBridgeStatus("checking");

    try {
      const health = await fetch(\`\${LOCAL_AI_BRIDGE_URL}/local-ai/health\`, {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      if (!health.ok) {
        throw new Error(\`Bridge health retornou \${health.status}\`);
      }

      const modelsResponse = await fetch(\`\${LOCAL_AI_BRIDGE_URL}/local-ai/models\`, {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      if (!modelsResponse.ok) {
        throw new Error(\`Bridge models retornou \${modelsResponse.status}\`);
      }

      const payload = (await modelsResponse.json()) as {
        ok: boolean;
        models: BridgeModel[];
      };

      setBridgeModels(payload.models || []);
      setBridgeStatus("online");
    } catch {
      setBridgeStatus("offline");
      setBridgeModels([]);
    }
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);`;

if (!code.includes(oldEffect)) {
  throw new Error("Bloco useEffect automatico nao encontrado. Patch abortado.");
}

code = code.replace(oldEffect, newEffect);

code = code.replace(
  `<span className={\`local-ai-status local-ai-status-\${bridgeStatus}\`}>
            {bridgeLabel}
          </span>`,
  `<span className={\`local-ai-status local-ai-status-\${bridgeStatus}\`}>
            {bridgeLabel}
          </span>
          <button
            type="button"
            className="local-ai-connect-button"
            onClick={refreshBridge}
            disabled={bridgeStatus === "checking" || sending}
            title="Conectar manualmente a ponte local do Ollama"
          >
            {bridgeStatus === "online" ? "reconectar IA local" : "conectar IA local"}
          </button>`
);

writeFileSync(path, code, "utf8");

console.log("ARGOS agora so tenta acessar a rede local quando o usuario clicar em conectar IA local.");
