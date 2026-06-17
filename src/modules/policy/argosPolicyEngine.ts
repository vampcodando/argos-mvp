import {
  getArgosEngineById,
  type ArgosEngine,
  type ArgosEngineId,
} from "./argosEngineCatalog";

export type ArgosProjectKind =
  | "argos_core"
  | "marketing"
  | "bruna"
  | "bigboom"
  | "qualyshape"
  | "tiktok"
  | "servico_social"
  | "alojamento_celeiro"
  | "institutional_internal";

export type ArgosDataClass =
  | "generic_prompt"
  | "public_marketing"
  | "creative_asset"
  | "source_code"
  | "technical_log"
  | "secret_or_token"
  | "athlete_data"
  | "family_data"
  | "social_report"
  | "institutional_document"
  | "database_content";

export type ArgosPolicyDecision = "allow" | "block" | "manual_review";

export type ArgosPolicyRequest = {
  projectKind: ArgosProjectKind;
  dataClass: ArgosDataClass;
  requestedEngineId: ArgosEngineId;
  paidCloudApisEnabled?: boolean;
};

export type ArgosPolicyResult = {
  decision: ArgosPolicyDecision;
  engine: ArgosEngine | null;
  route: "local" | "cloud" | "none";
  reasons: string[];
};

const SENSITIVE_PROJECTS: ArgosProjectKind[] = [
  "servico_social",
  "alojamento_celeiro",
  "institutional_internal",
];

const MARKETING_PROJECTS: ArgosProjectKind[] = [
  "marketing",
  "bruna",
  "bigboom",
  "qualyshape",
  "tiktok",
];

const SENSITIVE_DATA_CLASSES: ArgosDataClass[] = [
  "source_code",
  "technical_log",
  "secret_or_token",
  "athlete_data",
  "family_data",
  "social_report",
  "institutional_document",
  "database_content",
];

export function isSensitiveProject(projectKind: ArgosProjectKind) {
  return SENSITIVE_PROJECTS.includes(projectKind);
}

export function isMarketingProject(projectKind: ArgosProjectKind) {
  return MARKETING_PROJECTS.includes(projectKind);
}

export function isSensitiveData(dataClass: ArgosDataClass) {
  return SENSITIVE_DATA_CLASSES.includes(dataClass);
}

export function evaluateArgosPolicy(request: ArgosPolicyRequest): ArgosPolicyResult {
  const engine = getArgosEngineById(request.requestedEngineId);
  const reasons: string[] = [];

  if (!engine) {
    return {
      decision: "block",
      engine: null,
      route: "none",
      reasons: ["Motor solicitado não existe no catálogo do ARGOS."],
    };
  }

  if (isSensitiveProject(request.projectKind)) {
    reasons.push("Projeto institucional/sensível: somente processamento local.");
  }

  if (isSensitiveData(request.dataClass)) {
    reasons.push("Classe de dado sensível: proibido enviar para cloud/API externa.");
  }

  if ((isSensitiveProject(request.projectKind) || isSensitiveData(request.dataClass)) && engine.mode === "cloud") {
    return {
      decision: "block",
      engine,
      route: "none",
      reasons: [
        ...reasons,
        "Motor cloud bloqueado para Serviço Social, Alojamento/Celeiro, documentos, bancos, logs, tokens e dados pessoais/institucionais.",
      ],
    };
  }

  if ((isSensitiveProject(request.projectKind) || isSensitiveData(request.dataClass)) && !engine.sensitiveDataAllowed) {
    return {
      decision: "block",
      engine,
      route: "none",
      reasons: [
        ...reasons,
        "Motor local não está liberado para dados sensíveis neste catálogo.",
      ],
    };
  }

  if (engine.paidApi && !request.paidCloudApisEnabled) {
    return {
      decision: "block",
      engine,
      route: "none",
      reasons: [
        ...reasons,
        "APIs pagas/cloud estão desabilitadas nesta fase do ARGOS.",
      ],
    };
  }

  if (engine.mode === "cloud" && isMarketingProject(request.projectKind)) {
    return {
      decision: "manual_review",
      engine,
      route: "cloud",
      reasons: [
        ...reasons,
        "Cloud pode ser permitida para marketing, mas exige aprovação explícita antes de execução.",
      ],
    };
  }

  if (engine.mode === "cloud" && !isMarketingProject(request.projectKind)) {
    return {
      decision: "block",
      engine,
      route: "none",
      reasons: [
        ...reasons,
        "Cloud só está prevista para marketing, Bruna, BigBoom, QualyShape, TikTok e UGC.",
      ],
    };
  }

  return {
    decision: "allow",
    engine,
    route: "local",
    reasons: [
      ...reasons,
      "Motor local permitido dentro da política atual do ARGOS.",
    ],
  };
}
