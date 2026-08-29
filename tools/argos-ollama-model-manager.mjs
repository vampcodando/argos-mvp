#!/usr/bin/env node

const OLLAMA_BASE_URL = process.env.ARGOS_OLLAMA_URL || "http://127.0.0.1:11434";

const MODEL_PLAN = [
  { id: "qwen2.5:3b", tier: "leve", priority: 1, role: "chat local geral", action: "manter" },
  { id: "qwen2.5-coder:7b", tier: "reprovado", priority: 99, role: "codigo e patches", action: "nao usar" },
  { id: "hermes3:8b", tier: "medio_alto", priority: 2, role: "planner JSON agente", action: "avaliar depois" },
  { id: "qwen2.5vl:3b", tier: "medio", priority: 3, role: "visao local leve", action: "confirmar suporte" },
  { id: "qwen2.5vl:7b", tier: "pesado", priority: 4, role: "visao local melhor", action: "adiar" },
  { id: "diffusiongemma", tier: "incerto", priority: 5, role: "imagem experimental", action: "nao instalar agora" }
];

function header(title) {
  console.log("");
  console.log("ARGOS - " + title);
  console.log("=".repeat(60));
}

async function fetchInstalledModels() {
  const response = await fetch(OLLAMA_BASE_URL + "/api/tags");
  if (!response.ok) throw new Error("Ollama respondeu HTTP " + response.status);
  const payload = await response.json();
  return Array.isArray(payload.models) ? payload.models : [];
}

function plan() {
  header("Plano de modelos locais");
  for (const model of MODEL_PLAN) {
    console.log("- " + model.id);
    console.log("  prioridade: " + model.priority);
    console.log("  tier: " + model.tier);
    console.log("  papel: " + model.role);
    console.log("  acao: " + model.action);
  }
}

async function status() {
  header("Status Ollama");
  console.log("Ollama alvo: " + OLLAMA_BASE_URL);

  try {
    const models = await fetchInstalledModels();
    const installed = new Set(models.map((m) => String(m.name || "").toLowerCase()));

    console.log("Ollama: online");
    console.log("Modelos detectados: " + models.length);

    for (const candidate of MODEL_PLAN) {
      const found = installed.has(candidate.id.toLowerCase());
      console.log("- " + candidate.id + ": " + (found ? "instalado" : "nao detectado"));
    }
  } catch (error) {
    console.log("Ollama: offline ou inacessivel");
    console.log(error instanceof Error ? error.message : "Erro desconhecido");
    console.log("");
    console.log("Normal nesta etapa se o Ollama estiver desligado.");
  }
}

async function list() {
  header("Modelos instalados");
  const models = await fetchInstalledModels();

  if (!models.length) {
    console.log("Nenhum modelo retornado.");
    return;
  }

  for (const model of models) {
    console.log("- " + model.name);
  }
}

async function main() {
  const command = process.argv[2] || "status";

  if (command === "plan") return plan();
  if (command === "status") return status();
  if (command === "list") return list();

  console.log("Comando desconhecido: " + command);
  console.log("Use: plan, status ou list");
  process.exitCode = 1;
}

main();
