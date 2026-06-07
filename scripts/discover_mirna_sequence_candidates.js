const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const FASTA_PATH = fromRoot("data", "external", "mirbase_mature.fa");
const COMMON_DATASET = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const BASELINE_MODEL = fromRoot("models", "modelo_mirna_logistic.json");
const POSITIVE_MARKERS_CSV = fromRoot("data", "external", "breast_cancer_mirna_positive_markers.csv");
const OUTPUT_CSV = fromRoot("data", "processed", "mirna_sequence_candidate_ranking.csv");
const OUTPUT_MODEL = fromRoot("models", "modelo_mirna_sequence_patterns.json");
const OUTPUT_REPORT = fromRoot("reports", "mirna_sequence_candidate_discovery_report.txt");

const K_VALUES = [2, 3, 4, 5];
const TOP_MOTIF_COUNT = 30;
const TOP_CANDIDATE_COUNT = 30;

const KNOWN_MARKERS = [
  "let-7b-5p",
  "miR-106a-5p",
  "miR-19a-3p",
  "miR-19b-3p",
  "miR-20a-5p",
  "miR-223-3p",
  "miR-25-3p",
  "miR-425-5p",
  "miR-451a",
  "miR-92a-3p",
  "miR-93-5p",
  "miR-16-5p",
];

function parseCsvText(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCsvLine);
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        value += ch;
      }
    } else if (ch === ",") {
      out.push(value);
      value = "";
    } else if (ch === '"' && value.length === 0) {
      quoted = true;
    } else {
      value += ch;
    }
  }

  out.push(value);
  return out;
}

function normalizeSequence(sequence) {
  return sequence.toUpperCase().replaceAll("T", "U").replace(/[^ACGU]/g, "");
}

function normalizeMarkerName(name) {
  const lower = name.trim().toLowerCase();
  if (lower.startsWith("hsa-")) return lower;
  if (lower.startsWith("mir-") || lower.startsWith("let-")) return `hsa-${lower}`;
  return lower;
}

function matureFamilyBase(name) {
  return normalizeMarkerName(name)
    .replace(/-[35]p$/, "");
}

function precursorFamilyBase(name) {
  return normalizeMarkerName(name).replace(/-\d+$/, "");
}

function markerDisplayName(name) {
  return normalizeMarkerName(name).replace(/^hsa-/, "");
}

async function readCsvHeader(filePath) {
  const text = await fs.promises.readFile(filePath, "utf8");
  const firstLine = text.split(/\r?\n/, 1)[0];
  return parseCsvLine(firstLine);
}

async function readPositiveMarkers() {
  if (!fs.existsSync(POSITIVE_MARKERS_CSV)) {
    return KNOWN_MARKERS.map((marker) => ({
      mirna: marker,
      resolved_mature_mirna: marker,
      direcao: "",
      evidencia: "painel_inicial_do_projeto",
      fonte: "painel_inicial_do_projeto",
      tipo_amostra: "",
      observacao: "Marcador carregado da lista fixa do script porque o CSV curado ainda nao existe.",
    }));
  }

  const rows = parseCsvText(await fs.promises.readFile(POSITIVE_MARKERS_CSV, "utf8"));
  const header = rows[0];
  const indexByName = new Map(header.map((name, index) => [name, index]));
  const required = ["mirna", "resolved_mature_mirna"];
  for (const column of required) {
    if (!indexByName.has(column)) {
      throw new Error(`Coluna obrigatoria ausente em ${POSITIVE_MARKERS_CSV}: ${column}`);
    }
  }

  const markers = [];
  const seen = new Set();
  for (const cells of rows.slice(1)) {
    const mirna = cells[indexByName.get("mirna")]?.trim();
    const resolved = cells[indexByName.get("resolved_mature_mirna")]?.trim() || mirna;
    if (!mirna || !resolved) continue;
    const key = normalizeMarkerName(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    const metadata = Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
    markers.push({
      ...metadata,
      mirna,
      resolved_mature_mirna: resolved,
      direcao: cells[indexByName.get("direcao")] ?? "",
      evidencia: cells[indexByName.get("evidencia")] ?? "",
      fonte: cells[indexByName.get("fonte")] ?? "",
      tipo_amostra: cells[indexByName.get("tipo_amostra")] ?? "",
      observacao: cells[indexByName.get("observacao")] ?? "",
    });
  }

  return markers;
}

async function readMatureFasta(filePath) {
  const text = await fs.promises.readFile(filePath, "utf8");
  const entries = [];
  let header = null;
  let sequence = "";

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith(">")) {
      if (header) entries.push(parseFastaEntry(header, sequence));
      header = line.slice(1);
      sequence = "";
    } else {
      sequence += line.trim();
    }
  }

  if (header) entries.push(parseFastaEntry(header, sequence));
  return entries.filter((entry) => entry.name.startsWith("hsa-") && entry.sequence.length > 0);
}

function parseFastaEntry(header, sequence) {
  const [name, accession = ""] = header.split(/\s+/, 2);
  return {
    name,
    normalizedName: normalizeMarkerName(name),
    accession,
    header,
    sequence: normalizeSequence(sequence),
    familyBase: matureFamilyBase(name),
  };
}

function sparseKmerVector(sequence, kValues = K_VALUES) {
  const vector = new Map();
  let total = 0;

  // k-mers transformam uma sequencia curta em um vetor numerico de padroes locais.
  // Assim o ranking aprende composicao/motifs, e nao apenas o nome do microRNA.
  for (const k of kValues) {
    if (sequence.length < k) continue;
    for (let i = 0; i <= sequence.length - k; i += 1) {
      const kmer = sequence.slice(i, i + k);
      vector.set(kmer, (vector.get(kmer) ?? 0) + 1);
      total += 1;
    }
  }

  if (total === 0) return vector;
  for (const [kmer, count] of vector.entries()) {
    vector.set(kmer, count / total);
  }
  return vector;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  for (const [key, value] of a.entries()) dot += value * (b.get(key) ?? 0);

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function markerReferenceWeight(markerEntry) {
  const priority = (markerEntry.markerMetadata?.prioridade_projeto || markerEntry.markerMetadata?.recorrencia_bibliografica || "")
    .toLowerCase()
    .trim();
  if (priority === "alta") return 3;
  if (priority === "media") return 2;
  if (priority === "painel_inicial") return 2;
  return 1;
}

function meanSparseVector(vectors) {
  const centroid = new Map();
  let totalWeight = 0;
  for (const item of vectors) {
    const vector = item.vector ?? item;
    const weight = item.markerMetadata ? markerReferenceWeight(item) : 1;
    totalWeight += weight;
    for (const [key, value] of vector.entries()) {
      centroid.set(key, (centroid.get(key) ?? 0) + value * weight);
    }
  }
  for (const [key, value] of centroid.entries()) {
    centroid.set(key, value / Math.max(1, totalWeight));
  }
  return centroid;
}

function seedRegion(sequence) {
  return sequence.slice(1, 8);
}

function seedSimilarity(candidateSeed, markerSeeds) {
  let best = 0;
  for (const markerSeed of markerSeeds) {
    const length = Math.min(candidateSeed.length, markerSeed.length);
    if (length === 0) continue;
    let matches = 0;
    for (let i = 0; i < length; i += 1) {
      if (candidateSeed[i] === markerSeed[i]) matches += 1;
    }
    best = Math.max(best, matches / Math.max(candidateSeed.length, markerSeed.length));
  }
  return best;
}

function presenceCounts(entries, weighted = false) {
  const counts = new Map();
  for (const entry of entries) {
    const weight = weighted ? markerReferenceWeight(entry) : 1;
    const present = new Set(sparseKmerVector(entry.sequence).keys());
    for (const kmer of present) counts.set(kmer, (counts.get(kmer) ?? 0) + weight);
  }
  return counts;
}

function learnMotifs(markerEntries, backgroundEntries) {
  const markerPresence = presenceCounts(markerEntries, true);
  const backgroundPresence = presenceCounts(backgroundEntries);
  const markerTotalWeight = markerEntries.reduce((sum, entry) => sum + markerReferenceWeight(entry), 0);
  const motifs = [];

  // Motifs recorrentes sao k-mers presentes em mais de um marcador e enriquecidos
  // em relacao ao conjunto de microRNAs humanos analisados como background.
  for (const [kmer, markerCount] of markerPresence.entries()) {
    if (markerCount < 2) continue;
    const markerRate = (markerCount + 0.5) / (markerTotalWeight + 1);
    const backgroundRate = ((backgroundPresence.get(kmer) ?? 0) + 0.5) / (backgroundEntries.length + 1);
    const enrichment = Math.log2(markerRate / backgroundRate);
    if (enrichment <= 0) continue;
    motifs.push({ motif: kmer, markerCount, backgroundCount: backgroundPresence.get(kmer) ?? 0, enrichment });
  }

  return motifs
    .sort((a, b) => b.enrichment - a.enrichment || b.markerCount - a.markerCount || b.motif.length - a.motif.length)
    .slice(0, TOP_MOTIF_COUNT);
}

function motifCoverageScore(sequence, motifs) {
  const totalWeight = motifs.reduce((sum, motif) => sum + motif.enrichment, 0);
  if (totalWeight === 0) return 0;

  const shared = motifs.filter((motif) => sequence.includes(motif.motif));
  const sharedWeight = shared.reduce((sum, motif) => sum + motif.enrichment, 0);
  return sharedWeight / totalWeight;
}

function loadExpressionEvidence() {
  if (!fs.existsSync(BASELINE_MODEL)) return new Map();
  const model = JSON.parse(fs.readFileSync(BASELINE_MODEL, "utf8"));
  const evidence = new Map();
  if (!Array.isArray(model.features) || !Array.isArray(model.weights)) return evidence;

  model.features.forEach((feature, index) => {
    evidence.set(feature, model.weights[index]);
  });
  return evidence;
}

function expressionSummary(features, evidenceByFeature) {
  const weights = features
    .map((feature) => evidenceByFeature.get(feature))
    .filter((weight) => typeof weight === "number");
  if (!weights.length) return { maxAbsWeight: 0, direction: "sem_feature_no_model_baseline" };

  const maxAbsWeight = Math.max(...weights.map((weight) => Math.abs(weight)));
  const mean = weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
  return {
    maxAbsWeight,
    direction: mean > 0 ? "peso_baseline_positivo" : mean < 0 ? "peso_baseline_negativo" : "peso_baseline_neutro",
  };
}

function markerPairSimilarities(markerEntries) {
  const vectors = markerEntries.map((entry) => ({ ...entry, vector: sparseKmerVector(entry.sequence) }));
  const pairs = [];
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      pairs.push({
        a: markerDisplayName(vectors[i].name),
        b: markerDisplayName(vectors[j].name),
        similarity: cosineSimilarity(vectors[i].vector, vectors[j].vector),
      });
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}

function resolveMarkerEntry(marker, byNormalizedName) {
  const resolved = normalizeMarkerName(marker.resolved_mature_mirna || marker.mirna);
  const exact = byNormalizedName.get(resolved);
  if (exact) return { ...exact, markerMetadata: marker, requestedName: marker.mirna, resolutionMethod: "exact" };

  // Muitas fontes bibliograficas citam apenas "miR-21" ou "miR-145", sem
  // especificar 5p/3p. Quando nao ha match exato, buscamos a familia madura no
  // FASTA e preferimos 5p, depois 3p, mantendo o metodo registrado no relatorio.
  const family = matureFamilyBase(marker.mirna);
  const candidates = [...byNormalizedName.values()].filter((entry) => entry.familyBase === family);
  if (!candidates.length) return null;
  const preferred =
    candidates.find((entry) => entry.normalizedName.endsWith("-5p")) ??
    candidates.find((entry) => entry.normalizedName.endsWith("-3p")) ??
    candidates[0];
  return { ...preferred, markerMetadata: marker, requestedName: marker.mirna, resolutionMethod: "family_preferred" };
}

function scoreCandidate(candidate, markerEntries, centroid, motifs, markerSeeds) {
  const vector = sparseKmerVector(candidate.sequence);
  const markerSimilarities = markerEntries
    .map((marker) => ({
      marker: markerDisplayName(marker.name),
      similarity: cosineSimilarity(vector, marker.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const centroidSimilarity = cosineSimilarity(vector, centroid);
  const maxMarkerSimilarity = markerSimilarities[0]?.similarity ?? 0;
  const motifCoverage = motifCoverageScore(candidate.sequence, motifs);
  const seed = seedSimilarity(seedRegion(candidate.sequence), markerSeeds);

  // A pontuacao final e heuristica: combina similaridade global de k-mers,
  // proximidade com o marcador mais parecido, cobertura dos motifs enriquecidos
  // e semelhanca da regiao seed. Ela nao e probabilidade clinica.
  const score =
    0.5 * centroidSimilarity +
    0.25 * maxMarkerSimilarity +
    0.15 * motifCoverage +
    0.1 * seed;

  return {
    score: Math.max(0, Math.min(1, score)),
    centroidSimilarity,
    maxMarkerSimilarity,
    motifCoverage,
    seedSimilarity: seed,
    nearestMarkers: markerSimilarities.slice(0, 3),
    sharedMotifs: motifs.filter((motif) => candidate.sequence.includes(motif.motif)).slice(0, 8),
  };
}

async function main() {
  if (!fs.existsSync(FASTA_PATH)) {
    throw new Error(`FASTA nao encontrado: ${FASTA_PATH}`);
  }

  const header = await readCsvHeader(COMMON_DATASET);
  const datasetFeatures = header.slice(2);
  const positiveMarkers = await readPositiveMarkers();
  const featuresByFamily = new Map();
  for (const feature of datasetFeatures) {
    const family = precursorFamilyBase(feature);
    const current = featuresByFamily.get(family) ?? [];
    current.push(feature);
    featuresByFamily.set(family, current);
  }

  const matureEntries = await readMatureFasta(FASTA_PATH);
  const byNormalizedName = new Map(matureEntries.map((entry) => [entry.normalizedName, entry]));
  const knownNames = new Set(positiveMarkers.map((marker) => normalizeMarkerName(marker.resolved_mature_mirna || marker.mirna)));
  const markerEntries = positiveMarkers.map((marker) => resolveMarkerEntry(marker, byNormalizedName)).filter(Boolean);
  const foundMarkerNames = new Set(markerEntries.map((entry) => normalizeMarkerName(entry.markerMetadata.resolved_mature_mirna)));
  const missingMarkerSequences = positiveMarkers.filter(
    (marker) => !foundMarkerNames.has(normalizeMarkerName(marker.resolved_mature_mirna || marker.mirna))
  );

  if (markerEntries.length < 4) {
    throw new Error(`Sequencias insuficientes dos marcadores positivos: ${markerEntries.length}/${positiveMarkers.length}.`);
  }

  for (const marker of markerEntries) {
    marker.vector = sparseKmerVector(marker.sequence);
  }

  const candidateEntries = matureEntries
    .filter((entry) => featuresByFamily.has(entry.familyBase))
    .filter((entry) => !knownNames.has(entry.normalizedName))
    .map((entry) => ({
      ...entry,
      associatedFeatures: featuresByFamily.get(entry.familyBase) ?? [],
    }));

  const backgroundEntries = [...candidateEntries, ...markerEntries];
  const motifs = learnMotifs(markerEntries, backgroundEntries);
  const centroid = meanSparseVector(markerEntries);
  const markerSeeds = markerEntries.map((entry) => seedRegion(entry.sequence));
  const expressionEvidence = loadExpressionEvidence();

  const ranked = candidateEntries
    .map((candidate) => {
      const score = scoreCandidate(candidate, markerEntries, centroid, motifs, markerSeeds);
      const expression = expressionSummary(candidate.associatedFeatures, expressionEvidence);
      return { ...candidate, ...score, expression };
    })
    .sort((a, b) => b.score - a.score);

  const pairSimilarities = markerPairSimilarities(markerEntries);

  ensureDirectory(OUTPUT_CSV);
  ensureDirectory(OUTPUT_MODEL);
  ensureDirectory(OUTPUT_REPORT);

  const csvRows = [
    [
      "rank",
      "mirna",
      "accession",
      "sequence",
      "score_hipotese",
      "similaridade_centroide",
      "similaridade_marcador_mais_proximo",
      "cobertura_motifs",
      "similaridade_seed",
      "marcadores_mais_proximos",
      "motifs_compartilhados",
      "features_expressao_associadas",
      "baseline_expression_weight_max_abs",
      "baseline_expression_direction",
    ],
    ...ranked.map((candidate, index) => [
      index + 1,
      markerDisplayName(candidate.name),
      candidate.accession,
      candidate.sequence,
      candidate.score.toFixed(6),
      candidate.centroidSimilarity.toFixed(6),
      candidate.maxMarkerSimilarity.toFixed(6),
      candidate.motifCoverage.toFixed(6),
      candidate.seedSimilarity.toFixed(6),
      candidate.nearestMarkers.map((item) => `${item.marker}:${item.similarity.toFixed(3)}`).join("; "),
      candidate.sharedMotifs.map((item) => item.motif).join("; "),
      candidate.associatedFeatures.join("; "),
      candidate.expression.maxAbsWeight.toFixed(6),
      candidate.expression.direction,
    ]),
  ];
  await fs.promises.writeFile(OUTPUT_CSV, csvRows.map((row) => row.map(csvCell).join(",")).join("\n"), "utf8");

  const modelArtifact = {
    type: "one_class_sequence_pattern_similarity",
    reference: "miRBase mature human miRNA sequences",
    source_fasta: FASTA_PATH,
    source_dataset_for_candidate_pool: COMMON_DATASET,
    positive_markers_csv: POSITIVE_MARKERS_CSV,
    known_markers_requested: positiveMarkers,
    known_markers_with_sequence: markerEntries.map((entry) => ({
      requested_marker: entry.requestedName,
      marker: markerDisplayName(entry.name),
      accession: entry.accession,
      sequence: entry.sequence,
      seed: seedRegion(entry.sequence),
      family_base: entry.familyBase,
      resolution_method: entry.resolutionMethod,
      reference_weight: markerReferenceWeight(entry),
      metadata: entry.markerMetadata,
    })),
    missing_marker_sequences: missingMarkerSequences,
    k_values: K_VALUES,
    score_formula:
      "0.50*cosine(candidate_kmers, priority_weighted_marker_centroid) + 0.25*max_cosine(candidate_kmers, marker) + 0.15*motif_coverage + 0.10*seed_similarity",
    reference_weighting: {
      alta: 3,
      media: 2,
      painel_inicial: 2,
      exploratoria: 1,
      default: 1,
    },
    motifs,
    marker_pair_similarities: pairSimilarities,
    candidate_count: ranked.length,
    outputs: {
      ranking_csv: OUTPUT_CSV,
      report_txt: OUTPUT_REPORT,
    },
    warning:
      "Scores are computational hypotheses from sequence-pattern similarity, not diagnostic probabilities and not biological validation.",
  };
  await fs.promises.writeFile(OUTPUT_MODEL, JSON.stringify(modelArtifact, null, 2), "utf8");

  const topCandidates = ranked.slice(0, TOP_CANDIDATE_COUNT);
  const report = [
    "Descoberta computacional de candidatos por padroes sequenciais de miRNA",
    "",
    `FASTA de referencia: ${FASTA_PATH}`,
    `CSV de biomarcadores positivos: ${POSITIVE_MARKERS_CSV}`,
    `Dataset usado para limitar candidatos aos miRNAs presentes na base: ${COMMON_DATASET}`,
    `Biomarcadores positivos solicitados: ${positiveMarkers.length}`,
    `Biomarcadores positivos com sequencia encontrada: ${markerEntries.length}`,
    `Candidatos humanos avaliados: ${ranked.length}`,
    "",
    "Biomarcadores positivos analisados:",
    ...markerEntries.map(
      (entry) =>
        `${entry.requestedName} -> ${markerDisplayName(entry.name)}\t${entry.accession}\t` +
        `direcao=${entry.markerMetadata.direcao || "nao_informada"}\t` +
        `recorrencia=${entry.markerMetadata.recorrencia_bibliografica || "nao_informada"}\t` +
        `fontes=${entry.markerMetadata.numero_fontes || "nao_informado"}\t` +
        `peso=${markerReferenceWeight(entry)}\t` +
        `fonte=${entry.markerMetadata.fonte || "nao_informada"}\t` +
        `resolucao=${entry.resolutionMethod}\t` +
        `seed=${seedRegion(entry.sequence)}\tseq=${entry.sequence}`
    ),
    "",
    "Biomarcadores sem sequencia encontrada no FASTA:",
    ...(missingMarkerSequences.length
      ? missingMarkerSequences.map((marker) => `${marker.mirna} -> ${marker.resolved_mature_mirna}`)
      : ["nenhum"]),
    "",
    "Principais motifs/k-mers enriquecidos nos marcadores:",
    ...motifs
      .slice(0, 15)
      .map(
        (motif) =>
          `${motif.motif}\tpeso_marcadores=${motif.markerCount.toFixed(2)}\tbackground=${motif.backgroundCount}/${backgroundEntries.length}\tenriquecimento_log2=${motif.enrichment.toFixed(3)}`
      ),
    "",
    "Pares de marcadores com maior similaridade de k-mers:",
    ...pairSimilarities.map((pair) => `${pair.a} + ${pair.b}\tsimilaridade=${pair.similarity.toFixed(4)}`),
    "",
    "Novos microRNAs candidatos sugeridos:",
    ...topCandidates.map(
      (candidate, index) =>
        `${index + 1}. ${markerDisplayName(candidate.name)}\tscore=${candidate.score.toFixed(4)}\t` +
        `mais_proximos=${candidate.nearestMarkers.map((item) => `${item.marker}:${item.similarity.toFixed(3)}`).join(", ")}\t` +
        `motifs=${candidate.sharedMotifs.map((item) => item.motif).join(", ") || "nenhum_top_motif"}\t` +
        `features=${candidate.associatedFeatures.join(", ")}`
    ),
    "",
    "Como interpretar:",
    "O score combina similaridade de k-mers com o perfil medio ponderado dos biomarcadores positivos, similaridade com o marcador mais proximo, cobertura de motifs enriquecidos e similaridade da regiao seed.",
    "Pesos usados no perfil positivo: alta=3, media=2, painel_inicial=2, exploratoria=1.",
    "Valores mais altos indicam maior proximidade sequencial aos biomarcadores positivos conhecidos, nao uma probabilidade real de cancer de mama.",
    "Os pesos do modelo baseline de expressao aparecem no CSV apenas como evidencia auxiliar; eles nao entram no score sequencial.",
    "",
    "Aviso cientifico:",
    "Os candidatos acima sao possiveis candidatos e hipoteses computacionais. Eles nao devem ser tratados como diagnostico definitivo, biomarcador validado ou evidencia clinica sem validacao biologica/laboratorial independente.",
    "",
  ].join("\n");

  await fs.promises.writeFile(OUTPUT_REPORT, report, "utf8");
  console.log(report);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
