const REQUIRED_VISUAL_PROFILE_FIELDS = [
  "personagem",
  "cabelo",
  "parte_superior",
  "produto_principal",
  "cor_produto",
  "comprimento_visual",
  "fechamento_ou_amarracao",
  "acessorios",
  "calcado",
  "cenario",
  "iluminacao",
  "pose_inicial",
  "enquadramento_fonte",
];

const IDENTITY_LOCK_FIELDS = [
  "personagem",
  "cabelo",
  "parte_superior",
  "produto_principal",
  "cor_produto",
  "comprimento_visual",
  "fechamento_ou_amarracao",
  "acessorios",
  "calcado",
  "cenario",
  "iluminacao",
];

const EXPECTED_TIMEFRAMES = ["0s - 3s", "3s - 6s", "6s - 8s"];
const EXPECTED_SEGMENTS = ["Gancho", "Benefício", "CTA"];
const MAX_NARRATION_WORDS = [8, 9, 6];
const MAX_REPAIR_ATTEMPTS = 2;

const UNGROUNDED_CLAIMS = [
  "alta qualidade",
  "caimento perfeito",
  "confortável",
  "confortavel",
  "conforto",
  "durável",
  "duravel",
  "fluidez",
  "frete grátis",
  "frete gratis",
  "imperdível",
  "imperdivel",
  "não amassa",
  "nao amassa",
  "premium",
  "promoção",
  "promocao",
  "sustentável",
  "sustentavel",
  "últimas unidades",
  "ultimas unidades",
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”‘’`´]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value) {
  const matches = String(value || "").match(
    /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu
  );

  return matches ? matches.length : 0;
}

function getContentText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part) => part?.type === "text")
    .map((part) => String(part?.text || ""))
    .join("\n");
}

function collectConversationText(messages) {
  return messages
    .map((message) => getContentText(message?.content))
    .filter(Boolean)
    .join("\n\n");
}

export function detectVeo3MatrixWorkflow(messages, payload = {}) {
  if (String(payload?.workflow || "").trim() === "veo3_matrix") {
    return true;
  }

  const text = normalizeText(collectConversationText(messages));
  const markers = [
    "garment_identity_lock",
    "frame chaining",
    "frame_chaining",
    "video 1",
    "video 2",
    "video 3",
    "0s - 3s",
    "3s - 6s",
    "6s - 8s",
    "veo 3",
    "tiktok shop",
    "3 videos",
    "tres videos",
  ];

  const score = markers.reduce(
    (total, marker) => total + (text.includes(marker) ? 1 : 0),
    0
  );

  return score >= 4;
}

function extractBalancedJsonObjects(text) {
  const source = String(text || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        start = index;
      }

      depth += 1;
      continue;
    }

    if (character === "}") {
      if (depth === 0) {
        continue;
      }

      depth -= 1;

      if (depth === 0 && start >= 0) {
        objects.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function parseJsonArray(text) {
  const source = String(text || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  if (!source.startsWith("[") || !source.endsWith("]")) {
    return null;
  }

  try {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseVeo3Objects(text) {
  const arrayResult = parseJsonArray(text);

  if (arrayResult) {
    return {
      objects: arrayResult,
      parseErrors: [],
    };
  }

  const candidates = extractBalancedJsonObjects(text);
  const objects = [];
  const parseErrors = [];

  for (const [index, candidate] of candidates.entries()) {
    try {
      objects.push(JSON.parse(candidate));
    } catch (error) {
      parseErrors.push(
        `Objeto JSON ${index + 1} inválido: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }.`
      );
    }
  }

  return {
    objects,
    parseErrors,
  };
}

export function parseVisualProfile(text) {
  const { objects, parseErrors } = parseVeo3Objects(text);
  const profile = objects[0];

  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return {
      ok: false,
      profile: null,
      errors: [
        "O especialista visual não retornou um objeto JSON utilizável.",
        ...parseErrors,
      ],
    };
  }

  const errors = [];

  for (const field of REQUIRED_VISUAL_PROFILE_FIELDS) {
    const value = profile[field];

    if (typeof value !== "string" || !value.trim()) {
      errors.push(`A ficha visual não contém o campo textual obrigatório '${field}'.`);
    }
  }

  if (!Array.isArray(profile.elementos_cenario)) {
    errors.push("A ficha visual não contém o array 'elementos_cenario'.");
  }

  if (!Array.isArray(profile.incertezas)) {
    errors.push("A ficha visual não contém o array 'incertezas'.");
  }

  return {
    ok: errors.length === 0,
    profile,
    errors,
  };
}

function pushError(errors, code, message, path = "") {
  errors.push({ code, message, path });
}

function validateIdentityLock(lock, visualProfile, videoIndex, errors) {
  const path = `videos[${videoIndex}].garment_identity_lock`;

  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    pushError(
      errors,
      "INVALID_IDENTITY_LOCK",
      "garment_identity_lock deve ser um objeto descritivo, nunca true/false.",
      path
    );
    return;
  }

  for (const field of IDENTITY_LOCK_FIELDS) {
    const actual = lock[field];
    const expected = visualProfile?.[field];

    if (typeof actual !== "string" || !actual.trim()) {
      pushError(
        errors,
        "MISSING_IDENTITY_FIELD",
        `O campo '${field}' é obrigatório dentro de garment_identity_lock.`,
        `${path}.${field}`
      );
      continue;
    }

    if (
      typeof expected === "string" &&
      expected.trim() &&
      normalizeComparable(actual) !== normalizeComparable(expected)
    ) {
      pushError(
        errors,
        "IDENTITY_FIELD_MISMATCH",
        `O campo '${field}' deve copiar exatamente o valor da ficha visual: '${expected}'.`,
        `${path}.${field}`
      );
    }
  }
}

function validateCamera(camera, videoIndex, errors) {
  const path = `videos[${videoIndex}].camera_settings`;

  if (!camera || typeof camera !== "object" || Array.isArray(camera)) {
    pushError(errors, "INVALID_CAMERA", "camera_settings deve ser um objeto.", path);
    return;
  }

  const movement = normalizeText(camera.camera_movement);
  const framing = normalizeText(camera.framing);
  const aspectRatio = normalizeText(camera.aspect_ratio);

  if (!movement.includes("estatica") && !movement.includes("static")) {
    pushError(
      errors,
      "CAMERA_NOT_STATIC",
      "camera_movement deve declarar câmera estática.",
      `${path}.camera_movement`
    );
  }

  if (
    !framing.includes("plano inteiro") &&
    !framing.includes("corpo inteiro") &&
    !framing.includes("full body")
  ) {
    pushError(
      errors,
      "INVALID_FULL_BODY_FRAMING",
      "framing deve ser plano inteiro/corpo inteiro.",
      `${path}.framing`
    );
  }

  if (
    framing.includes("close-up") ||
    framing.includes("close up") ||
    framing.includes("plano medio") ||
    framing.includes("meio corpo")
  ) {
    pushError(
      errors,
      "CONTRADICTORY_FRAMING",
      "O enquadramento não pode combinar close-up ou plano médio com corpo inteiro.",
      `${path}.framing`
    );
  }

  if (aspectRatio !== "9:16" && aspectRatio !== "9x16") {
    pushError(
      errors,
      "INVALID_ASPECT_RATIO",
      "aspect_ratio deve ser exatamente '9:16'.",
      `${path}.aspect_ratio`
    );
  }
}

function validateEditing(editing, videoIndex, errors) {
  const path = `videos[${videoIndex}].editing`;

  if (!editing || typeof editing !== "object" || Array.isArray(editing)) {
    pushError(errors, "INVALID_EDITING", "editing deve ser um objeto.", path);
    return;
  }

  if (normalizeComparable(editing.cut_at_3s) !== "hard cut") {
    pushError(
      errors,
      "MISSING_HARD_CUT_3S",
      "editing.cut_at_3s deve ser 'hard_cut'.",
      `${path}.cut_at_3s`
    );
  }

  if (normalizeComparable(editing.cut_at_6s) !== "hard cut") {
    pushError(
      errors,
      "MISSING_HARD_CUT_6S",
      "editing.cut_at_6s deve ser 'hard_cut'.",
      `${path}.cut_at_6s`
    );
  }
}

function validateTimeline(timeline, videoIndex, errors) {
  const path = `videos[${videoIndex}].timeline`;

  if (!Array.isArray(timeline) || timeline.length !== 3) {
    pushError(
      errors,
      "INVALID_TIMELINE_LENGTH",
      "timeline deve conter exatamente 3 segmentos.",
      path
    );
    return;
  }

  timeline.forEach((item, segmentIndex) => {
    const itemPath = `${path}[${segmentIndex}]`;
    const timeframe = normalizeComparable(item?.timeframe);
    const expectedTimeframe = normalizeComparable(
      EXPECTED_TIMEFRAMES[segmentIndex]
    );
    const segment = normalizeComparable(item?.segment);
    const expectedSegment = normalizeComparable(EXPECTED_SEGMENTS[segmentIndex]);
    const narration = String(item?.narration || "").trim();
    const visualAction = String(item?.visual_action || "").trim();

    if (timeframe !== expectedTimeframe) {
      pushError(
        errors,
        "INVALID_TIMEFRAME",
        `timeframe deve ser exatamente '${EXPECTED_TIMEFRAMES[segmentIndex]}'.`,
        `${itemPath}.timeframe`
      );
    }

    if (segment !== expectedSegment) {
      pushError(
        errors,
        "INVALID_SEGMENT",
        `segment deve ser exatamente '${EXPECTED_SEGMENTS[segmentIndex]}'.`,
        `${itemPath}.segment`
      );
    }

    if (!visualAction) {
      pushError(
        errors,
        "EMPTY_VISUAL_ACTION",
        "visual_action não pode ficar vazio.",
        `${itemPath}.visual_action`
      );
    }

    if (!narration) {
      pushError(
        errors,
        "EMPTY_NARRATION",
        "narration não pode ficar vazia.",
        `${itemPath}.narration`
      );
      return;
    }

    const wordCount = countWords(narration);
    const maximum = MAX_NARRATION_WORDS[segmentIndex];

    if (wordCount > maximum) {
      pushError(
        errors,
        "NARRATION_TOO_LONG",
        `A narração possui ${wordCount} palavras; o máximo deste segmento é ${maximum}.`,
        `${itemPath}.narration`
      );
    }
  });
}

function validateFrameChaining(frameChaining, videoIndex, errors) {
  const path = `videos[${videoIndex}].frame_chaining`;
  const expectedInput = [
    "Imagem Inicial Enviada",
    "Frame Final do Vídeo 1",
    "Frame Final do Vídeo 2",
  ][videoIndex];
  const expectedOutput = [
    "Frame Final do Vídeo 1",
    "Frame Final do Vídeo 2",
    "Frame Final do Vídeo 3",
  ][videoIndex];

  if (
    !frameChaining ||
    typeof frameChaining !== "object" ||
    Array.isArray(frameChaining)
  ) {
    pushError(
      errors,
      "INVALID_FRAME_CHAINING",
      "frame_chaining deve ser um objeto.",
      path
    );
    return;
  }

  if (
    normalizeComparable(frameChaining.input_source) !==
    normalizeComparable(expectedInput)
  ) {
    pushError(
      errors,
      "INVALID_INPUT_SOURCE",
      `input_source deve ser exatamente '${expectedInput}'.`,
      `${path}.input_source`
    );
  }

  if (
    normalizeComparable(frameChaining.output_target) !==
    normalizeComparable(expectedOutput)
  ) {
    pushError(
      errors,
      "INVALID_OUTPUT_TARGET",
      `output_target deve ser exatamente '${expectedOutput}'.`,
      `${path}.output_target`
    );
  }

  for (const stateField of ["start_frame_state", "end_frame_state"]) {
    if (
      typeof frameChaining[stateField] !== "string" ||
      !frameChaining[stateField].trim()
    ) {
      pushError(
        errors,
        "MISSING_FRAME_STATE",
        `${stateField} deve descrever de forma completa e objetiva o frame.`,
        `${path}.${stateField}`
      );
    }
  }
}

function validateGrounding(videos, sourceText, visualProfile, errors) {
  const source = normalizeText(sourceText);
  const output = normalizeText(JSON.stringify(videos));

  for (const claim of UNGROUNDED_CLAIMS) {
    const normalizedClaim = normalizeText(claim);

    if (output.includes(normalizedClaim) && !source.includes(normalizedClaim)) {
      pushError(
        errors,
        "UNGROUNDED_CLAIM",
        `A alegação '${claim}' aparece na matriz, mas não consta na ficha técnica nem no pedido do usuário.`,
        "videos"
      );
    }
  }

  const visibleColor = normalizeComparable(visualProfile?.cor_produto);

  if (visibleColor && visibleColor !== "nao confirmado") {
    videos.forEach((video, index) => {
      const serialized = normalizeComparable(JSON.stringify(video));

      if (!serialized.includes(visibleColor)) {
        pushError(
          errors,
          "VISIBLE_COLOR_MISSING",
          `O Vídeo ${index + 1} deve preservar a cor visual '${visualProfile.cor_produto}'.`,
          `videos[${index}]`
        );
      }
    });
  }

  const ambiguousColorPattern = /\b(?:preto\s*[\/]\s*marrom|marrom\s*[\/]\s*preto)\b/i;

  videos.forEach((video, index) => {
    if (ambiguousColorPattern.test(JSON.stringify(video))) {
      pushError(
        errors,
        "AMBIGUOUS_COLOR",
        "Não use cor ambígua como 'preto/marrom'; use somente a cor confirmada pela ficha visual.",
        `videos[${index}]`
      );
    }
  });
}

function tokensForSimilarity(value) {
  return new Set(
    normalizeComparable(value)
      .split(" ")
      .filter((token) => token.length >= 4)
  );
}

function jaccardSimilarity(left, right) {
  if (!left.size || !right.size) {
    return 0;
  }

  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;

  return union ? intersection / union : 0;
}

function validateCreativeDiversity(videos, errors) {
  for (let leftIndex = 0; leftIndex < videos.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < videos.length; rightIndex += 1) {
      const leftText = [
        videos[leftIndex]?.creative_concept,
        ...(Array.isArray(videos[leftIndex]?.timeline)
          ? videos[leftIndex].timeline.map((item) => item?.visual_action)
          : []),
      ].join(" ");
      const rightText = [
        videos[rightIndex]?.creative_concept,
        ...(Array.isArray(videos[rightIndex]?.timeline)
          ? videos[rightIndex].timeline.map((item) => item?.visual_action)
          : []),
      ].join(" ");
      const similarity = jaccardSimilarity(
        tokensForSimilarity(leftText),
        tokensForSimilarity(rightText)
      );

      if (similarity >= 0.72) {
        pushError(
          errors,
          "CREATIVES_TOO_SIMILAR",
          `Os Vídeos ${leftIndex + 1} e ${rightIndex + 1} repetem demasiadamente a mesma proposta criativa (${Math.round(
            similarity * 100
          )}% de similaridade lexical).`,
          "videos"
        );
      }
    }
  }
}

function validateNegativePrompt(video, videoIndex, errors) {
  const negativePrompt = Array.isArray(video?.negative_prompt)
    ? video.negative_prompt.join(" ")
    : String(video?.negative_prompt || "");
  const negative = normalizeText(negativePrompt);
  const actions = normalizeText(
    Array.isArray(video?.timeline)
      ? video.timeline.map((item) => item?.visual_action).join(" ")
      : ""
  );

  if (!negative.trim()) {
    pushError(
      errors,
      "EMPTY_NEGATIVE_PROMPT",
      "negative_prompt não pode ficar vazio.",
      `videos[${videoIndex}].negative_prompt`
    );
    return;
  }

  if (
    negative.includes("sem sorriso") &&
    (actions.includes("sorrindo") || actions.includes("sorriso"))
  ) {
    pushError(
      errors,
      "NEGATIVE_PROMPT_CONTRADICTION",
      "negative_prompt proíbe sorriso, mas a timeline solicita sorriso.",
      `videos[${videoIndex}]`
    );
  }

  if (
    (negative.includes("sem movimento") ||
      negative.includes("nao movimentar") ||
      negative.includes("movimento nao")) &&
    /(giro|girar|passo|andar|levanta|estende|vira|virar|movimento)/.test(actions)
  ) {
    pushError(
      errors,
      "NEGATIVE_PROMPT_CONTRADICTION",
      "negative_prompt proíbe movimento, mas a timeline solicita movimento.",
      `videos[${videoIndex}]`
    );
  }
}

export function validateVeo3Matrix({ objects, visualProfile, sourceText }) {
  const errors = [];

  if (!Array.isArray(objects) || objects.length !== 3) {
    pushError(
      errors,
      "INVALID_OBJECT_COUNT",
      `A resposta deve conter exatamente 3 objetos JSON; foram encontrados ${
        Array.isArray(objects) ? objects.length : 0
      }.` ,
      "videos"
    );
  }

  const videos = Array.isArray(objects) ? objects.slice(0, 3) : [];

  videos.forEach((video, index) => {
    const path = `videos[${index}]`;

    if (!video || typeof video !== "object" || Array.isArray(video)) {
      pushError(errors, "INVALID_VIDEO_OBJECT", "Cada vídeo deve ser um objeto JSON.", path);
      return;
    }

    if (normalizeComparable(video.video_id) !== `vid${index + 1}`) {
      pushError(
        errors,
        "INVALID_VIDEO_ID",
        `video_id deve ser exatamente 'vid${index + 1}'.`,
        `${path}.video_id`
      );
    }

    if (!["8", "8s"].includes(normalizeComparable(video.duration))) {
      pushError(
        errors,
        "INVALID_DURATION",
        "duration deve ser exatamente '8s'.",
        `${path}.duration`
      );
    }

    if (typeof video.creative_concept !== "string" || !video.creative_concept.trim()) {
      pushError(
        errors,
        "MISSING_CREATIVE_CONCEPT",
        "creative_concept deve resumir a proposta criativa exclusiva do vídeo.",
        `${path}.creative_concept`
      );
    }

    validateFrameChaining(video.frame_chaining, index, errors);
    validateIdentityLock(video.garment_identity_lock, visualProfile, index, errors);
    validateCamera(video.camera_settings, index, errors);
    validateEditing(video.editing, index, errors);
    validateTimeline(video.timeline, index, errors);
    validateNegativePrompt(video, index, errors);
  });

  if (videos.length === 3) {
    const firstEnd = normalizeComparable(
      videos[0]?.frame_chaining?.end_frame_state
    );
    const secondStart = normalizeComparable(
      videos[1]?.frame_chaining?.start_frame_state
    );
    const secondEnd = normalizeComparable(
      videos[1]?.frame_chaining?.end_frame_state
    );
    const thirdStart = normalizeComparable(
      videos[2]?.frame_chaining?.start_frame_state
    );

    if (!firstEnd || !secondStart || firstEnd !== secondStart) {
      pushError(
        errors,
        "BROKEN_CHAIN_V1_V2",
        "O start_frame_state do Vídeo 2 deve copiar exatamente o end_frame_state do Vídeo 1.",
        "videos[1].frame_chaining.start_frame_state"
      );
    }

    if (!secondEnd || !thirdStart || secondEnd !== thirdStart) {
      pushError(
        errors,
        "BROKEN_CHAIN_V2_V3",
        "O start_frame_state do Vídeo 3 deve copiar exatamente o end_frame_state do Vídeo 2.",
        "videos[2].frame_chaining.start_frame_state"
      );
    }

    validateGrounding(videos, sourceText, visualProfile, errors);
    validateCreativeDiversity(videos, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    videos,
  };
}

export function buildVisualProfileInstruction() {
  return [
    "Você é o especialista visual do ARGOS.",
    "Examine somente os pixels das imagens e retorne UMA FICHA VISUAL ESTRUTURADA.",
    "Não execute a tarefa comercial final e não copie medidas, composição ou alegações do texto como se fossem visíveis.",
    "Retorne somente um objeto JSON válido, sem markdown, explicações ou texto antes/depois.",
    "Use exatamente este schema:",
    JSON.stringify(
      {
        personagem: "descrição visual objetiva ou não confirmado",
        cabelo: "descrição visual objetiva ou não confirmado",
        parte_superior: "descrição visual objetiva ou não confirmado",
        produto_principal: "descrição visual objetiva ou não confirmado",
        cor_produto: "uma única cor visual confirmada ou não confirmado",
        comprimento_visual: "descrição visual objetiva ou não confirmado",
        fechamento_ou_amarracao: "descrição visual objetiva ou não confirmado",
        acessorios: "descrição visual objetiva ou não confirmado",
        calcado: "descrição visual objetiva ou não confirmado",
        cenario: "descrição visual objetiva ou não confirmado",
        elementos_cenario: ["elemento visível"],
        iluminacao: "descrição visual objetiva ou não confirmado",
        pose_inicial: "descrição visual objetiva e completa",
        enquadramento_fonte: "descrição do enquadramento real da imagem",
        incertezas: ["apenas incertezas reais"],
      },
      null,
      2
    ),
    "Não use alternativas de cor separadas por barra. Quando a cor não puder ser confirmada, escreva exatamente 'não confirmado'.",
    "Responda em português brasileiro.",
  ].join("\n");
}

export function buildVeo3DirectorInstruction(visualProfile) {
  return [
    "Você está executando o workflow estrito ARGOS VEO3_MATRIX.",
    "A resposta será validada automaticamente e rejeitada se qualquer regra falhar.",
    "Retorne SOMENTE 3 objetos JSON válidos, separados por uma linha em branco, sem array, markdown ou comentários.",
    "Cada objeto deve seguir exatamente este schema:",
    JSON.stringify(
      {
        video_id: "vid1",
        duration: "8s",
        creative_concept: "conceito exclusivo deste vídeo",
        frame_chaining: {
          input_source: "Imagem Inicial Enviada",
          output_target: "Frame Final do Vídeo 1",
          start_frame_state: "estado visual completo do primeiro frame",
          end_frame_state: "estado visual completo do último frame",
        },
        garment_identity_lock: {
          personagem: "copiar exatamente da ficha visual",
          cabelo: "copiar exatamente da ficha visual",
          parte_superior: "copiar exatamente da ficha visual",
          produto_principal: "copiar exatamente da ficha visual",
          cor_produto: "copiar exatamente da ficha visual",
          comprimento_visual: "copiar exatamente da ficha visual",
          fechamento_ou_amarracao: "copiar exatamente da ficha visual",
          acessorios: "copiar exatamente da ficha visual",
          calcado: "copiar exatamente da ficha visual",
          cenario: "copiar exatamente da ficha visual",
          iluminacao: "copiar exatamente da ficha visual",
        },
        negative_prompt: "restrições sem contradizer as ações solicitadas",
        camera_settings: {
          camera_movement: "estática",
          framing: "plano inteiro vertical",
          aspect_ratio: "9:16",
        },
        editing: {
          cut_at_3s: "hard_cut",
          cut_at_6s: "hard_cut",
        },
        timeline: [
          {
            timeframe: "0s - 3s",
            segment: "Gancho",
            visual_action: "ação visual objetiva",
            narration: "máximo 8 palavras",
          },
          {
            timeframe: "3s - 6s",
            segment: "Benefício",
            visual_action: "ação visual objetiva",
            narration: "máximo 9 palavras",
          },
          {
            timeframe: "6s - 8s",
            segment: "CTA",
            visual_action: "ação visual objetiva",
            narration: "máximo 6 palavras",
          },
        ],
      },
      null,
      2
    ),
    "Regras obrigatórias:",
    "1. Os video_id devem ser vid1, vid2 e vid3, nessa ordem.",
    "2. O Vídeo 1 usa Imagem Inicial Enviada; o Vídeo 2 usa Frame Final do Vídeo 1; o Vídeo 3 usa Frame Final do Vídeo 2.",
    "3. start_frame_state do Vídeo 2 deve copiar literalmente end_frame_state do Vídeo 1.",
    "4. start_frame_state do Vídeo 3 deve copiar literalmente end_frame_state do Vídeo 2.",
    "5. garment_identity_lock deve copiar literalmente os campos da FICHA VISUAL ESTRUTURADA abaixo; nunca use true/false.",
    "6. Use uma única cor confirmada. Não use 'preto/marrom' ou outras alternativas.",
    "7. Não invente conforto, sustentabilidade, durabilidade, promoção, desconto, frete, estoque, fluidez, qualidade premium ou qualquer alegação ausente da ficha técnica.",
    "8. Câmera estática, plano inteiro vertical 9:16 e hard cuts exatamente em 3s e 6s.",
    "9. Os três conceitos devem ser realmente diferentes.",
    "10. Não faça a personagem levantar a saia, deformar a peça ou executar gesto incompatível com apresentação comercial natural.",
    "FICHA VISUAL ESTRUTURADA — copie seus valores literalmente no garment_identity_lock:",
    JSON.stringify(visualProfile, null, 2),
  ].join("\n");
}

export function buildRepairMessages({ messages, draft, errors, visualProfile }) {
  const compactErrors = errors.slice(0, 40).map((error, index) =>
    `${index + 1}. [${error.code}] ${error.path ? `${error.path}: ` : ""}${error.message}`
  );

  return [
    ...messages,
    {
      role: "assistant",
      content: draft,
    },
    {
      role: "system",
      content: [
        "O rascunho anterior foi REPROVADO pelo validador determinístico do ARGOS.",
        "Corrija todas as violações listadas sem remover fatos válidos da ficha técnica ou da ficha visual.",
        "Retorne novamente somente 3 objetos JSON válidos e separados por linha em branco.",
        "Não explique as correções.",
        "FICHA VISUAL CANÔNICA:",
        JSON.stringify(visualProfile, null, 2),
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "VIOLAÇÕES DETECTADAS:",
        ...compactErrors,
        "",
        "Gere a versão integral corrigida agora.",
      ].join("\n"),
    },
  ];
}

export function formatVeo3Response(videos) {
  return videos.map((video) => JSON.stringify(video, null, 2)).join("\n\n");
}

export function getVeo3RepairAttemptLimit() {
  return MAX_REPAIR_ATTEMPTS;
}
