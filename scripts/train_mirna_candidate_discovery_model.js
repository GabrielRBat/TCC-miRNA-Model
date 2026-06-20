const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const FASTA_PATH = fromRoot("data", "external", "mirbase_mature.fa");
const DATASET_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const POSITIVE_MARKERS_CSV = fromRoot("data", "external", "breast_cancer_mirna_positive_markers.csv");

const OUTPUT_MODEL = fromRoot("models", "modelo_mirna_candidate_discovery.json");
const OUTPUT_RANKING = fromRoot("data", "processed", "mirna_candidate_discovery_model_ranking.csv");
const OUTPUT_REPORT = fromRoot("reports", "modelo_mirna_candidate_discovery_report.txt");

const K_VALUES = [2, 3, 4, 5];
const TRAIN_EPOCHS = 900;
const LOPO_EPOCHS = 220;
const LEARNING_RATE = 0.8;
const L2 = 0.015;
const UNLABELED_BACKGROUND_TOTAL_WEIGHT_RATIO = 0.5;
const TOP_REPORT_COUNT = 30;

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

function readCsv(filePath) {
  const rows = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCsvLine);
  const header = rows[0];
  return {
    header,
    rows: rows.slice(1),
    indexByName: new Map(header.map((name, index) => [name, index])),
  };
}

function normalizeSequence(sequence) {
  return sequence.toUpperCase().replaceAll("T", "U").replace(/[^ACGU]/g, "");
}

function normalizeMarkerName(name) {
  const lower = String(name ?? "").trim().toLowerCase();
  if (lower.startsWith("hsa-")) return lower;
  if (lower.startsWith("mir-") || lower.startsWith("let-")) return `hsa-${lower}`;
  return lower;
}

function matureFamilyBase(name) {
  return normalizeMarkerName(name).replace(/-[35]p$/, "");
}

function precursorFamilyBase(name) {
  return normalizeMarkerName(name).replace(/-\d+$/, "");
}

function markerDisplayName(name) {
  return normalizeMarkerName(name).replace(/^hsa-/, "");
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

function readMatureFasta(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
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

function readPositiveMarkers() {
  const parsed = readCsv(POSITIVE_MARKERS_CSV);
  for (const column of ["mirna", "resolved_mature_mirna"]) {
    if (!parsed.indexByName.has(column)) {
      throw new Error(`Coluna obrigatoria ausente em ${POSITIVE_MARKERS_CSV}: ${column}`);
    }
  }

  const seen = new Set();
  const markers = [];
  for (const row of parsed.rows) {
    const mirna = row[parsed.indexByName.get("mirna")]?.trim();
    const resolved = row[parsed.indexByName.get("resolved_mature_mirna")]?.trim() || mirna;
    if (!mirna || !resolved) continue;
    const key = normalizeMarkerName(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    const metadata = Object.fromEntries(parsed.header.map((name, index) => [name, row[index] ?? ""]));
    markers.push({
      ...metadata,
      mirna,
      resolved_mature_mirna: resolved,
    });
  }
  return markers;
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

function resolveMarkerEntry(marker, byNormalizedName) {
  const resolved = normalizeMarkerName(marker.resolved_mature_mirna || marker.mirna);
  const exact = byNormalizedName.get(resolved);
  if (exact) return { ...exact, markerMetadata: marker, requestedName: marker.mirna, resolutionMethod: "exact" };

  const family = matureFamilyBase(marker.mirna);
  const candidates = [...byNormalizedName.values()].filter((entry) => entry.familyBase === family);
  if (!candidates.length) return null;
  const preferred =
    candidates.find((entry) => entry.normalizedName.endsWith("-5p")) ??
    candidates.find((entry) => entry.normalizedName.endsWith("-3p")) ??
    candidates[0];
  return { ...preferred, markerMetadata: marker, requestedName: marker.mirna, resolutionMethod: "family_preferred" };
}

function seedRegion(sequence) {
  return sequence.slice(1, 8);
}

function allKmers(sequence, kValues = K_VALUES) {
  const kmers = [];
  for (const k of kValues) {
    if (sequence.length < k) continue;
    for (let i = 0; i <= sequence.length - k; i += 1) {
      kmers.push(sequence.slice(i, i + k));
    }
  }
  return kmers;
}

function sequenceVector(sequence, vocabulary = null) {
  const vector = new Map();
  const kmers = allKmers(sequence);
  for (const kmer of kmers) {
    const feature = `kmer:${kmer}`;
    if (vocabulary && !vocabulary.has(feature)) continue;
    vector.set(feature, (vector.get(feature) ?? 0) + 1);
  }

  const seedFeature = `seed:${seedRegion(sequence)}`;
  if (!vocabulary || vocabulary.has(seedFeature)) {
    vector.set(seedFeature, (vector.get(seedFeature) ?? 0) + 2);
  }

  const total = [...vector.values()].reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    for (const [feature, value] of vector.entries()) {
      vector.set(feature, value / total);
    }
  }
  return vector;
}

function buildVocabulary(positiveEntries) {
  const weightedPresence = new Map();
  for (const entry of positiveEntries) {
    const weight = markerReferenceWeight(entry);
    const features = new Set(sequenceVector(entry.sequence).keys());
    for (const feature of features) {
      weightedPresence.set(feature, (weightedPresence.get(feature) ?? 0) + weight);
    }
  }

  return new Set(
    [...weightedPresence.entries()]
      .filter(([feature, count]) => feature.startsWith("seed:") || count >= 2)
      .map(([feature]) => feature)
  );
}

function sigmoid(value) {
  if (value < -35) return 0;
  if (value > 35) return 1;
  return 1 / (1 + Math.exp(-value));
}

function dot(weights, vector) {
  let value = 0;
  for (const [feature, amount] of vector.entries()) {
    value += (weights.get(feature) ?? 0) * amount;
  }
  return value;
}

function trainContrastiveModel(positiveEntries, backgroundEntries, epochs) {
  const vocabulary = buildVocabulary(positiveEntries);
  const positiveTotalWeight = positiveEntries.reduce((sum, entry) => sum + markerReferenceWeight(entry), 0);
  const backgroundWeight =
    (positiveTotalWeight * UNLABELED_BACKGROUND_TOTAL_WEIGHT_RATIO) / Math.max(1, backgroundEntries.length);

  const samples = [
    ...positiveEntries.map((entry) => ({
      label: 1,
      weight: markerReferenceWeight(entry),
      vector: sequenceVector(entry.sequence, vocabulary),
    })),
    ...backgroundEntries.map((entry) => ({
      label: 0,
      weight: backgroundWeight,
      vector: sequenceVector(entry.sequence, vocabulary),
    })),
  ];

  const weights = new Map([...vocabulary].map((feature) => [feature, 0]));
  let bias = Math.log((positiveTotalWeight + 1) / (positiveTotalWeight * UNLABELED_BACKGROUND_TOTAL_WEIGHT_RATIO + 1));
  const history = [];

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradients = new Map();
    let biasGradient = 0;
    let weightedLoss = 0;
    let totalWeight = 0;

    for (const sample of samples) {
      const prediction = sigmoid(bias + dot(weights, sample.vector));
      const clipped = Math.min(1 - 1e-9, Math.max(1e-9, prediction));
      weightedLoss += sample.weight * -(sample.label * Math.log(clipped) + (1 - sample.label) * Math.log(1 - clipped));
      totalWeight += sample.weight;

      const error = sample.weight * (prediction - sample.label);
      biasGradient += error;
      for (const [feature, amount] of sample.vector.entries()) {
        gradients.set(feature, (gradients.get(feature) ?? 0) + error * amount);
      }
    }

    const learningRate = LEARNING_RATE / Math.sqrt(1 + epoch / 80);
    for (const feature of vocabulary) {
      const current = weights.get(feature) ?? 0;
      const gradient = (gradients.get(feature) ?? 0) / Math.max(1, totalWeight) + L2 * current;
      weights.set(feature, current - learningRate * gradient);
    }
    bias -= learningRate * (biasGradient / Math.max(1, totalWeight));

    if (epoch === 0 || (epoch + 1) % 100 === 0 || epoch === epochs - 1) {
      history.push({
        epoch: epoch + 1,
        weighted_log_loss: weightedLoss / Math.max(1, totalWeight),
      });
    }
  }

  return {
    vocabulary,
    weights,
    bias,
    history,
  };
}

function sequenceModelScore(model, sequence) {
  const vector = sequenceVector(sequence, model.vocabulary);
  return sigmoid(model.bias + dot(model.weights, vector));
}

function sequenceModelLogit(model, sequence) {
  const vector = sequenceVector(sequence, model.vocabulary);
  return model.bias + dot(model.weights, vector);
}

function topContributingFeatures(model, sequence, limit = 10) {
  const vector = sequenceVector(sequence, model.vocabulary);
  return [...vector.entries()]
    .map(([feature, amount]) => ({
      feature,
      contribution: amount * (model.weights.get(feature) ?? 0),
    }))
    .filter((item) => item.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, limit);
}

function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  for (const [key, value] of a.entries()) dotProduct += value * (b.get(key) ?? 0);
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function nearestMarkers(candidate, markerEntries, vocabulary) {
  const vector = sequenceVector(candidate.sequence, vocabulary);
  return markerEntries
    .map((marker) => ({
      marker: markerDisplayName(marker.name),
      similarity: cosineSimilarity(vector, sequenceVector(marker.sequence, vocabulary)),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function std(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeAuc(positives, negatives) {
  const scored = [
    ...positives.map((value) => ({ value, label: 1 })),
    ...negatives.map((value) => ({ value, label: 0 })),
  ].sort((a, b) => a.value - b.value);

  let rankSumPositive = 0;
  let i = 0;
  while (i < scored.length) {
    let j = i + 1;
    while (j < scored.length && scored[j].value === scored[i].value) j += 1;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) {
      if (scored[k].label === 1) rankSumPositive += avgRank;
    }
    i = j;
  }

  const positiveCount = positives.length;
  const negativeCount = negatives.length;
  return (rankSumPositive - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount);
}

function expressionScore(metrics) {
  const aucSignal = Math.max(0, (metrics.absAuc - 0.5) * 2);
  const foldSignal = Math.min(1, Math.abs(metrics.log2FoldChange) / 3);
  const nonzeroSignal = Math.min(1, Math.abs(metrics.diseaseNonzeroPct - metrics.healthyNonzeroPct) / 50);
  return 0.6 * aucSignal + 0.3 * foldSignal + 0.1 * nonzeroSignal;
}

function directionFromLog2Fc(value) {
  if (value > 0.05) return "maior_em_doentes";
  if (value < -0.05) return "menor_em_doentes";
  return "sem_diferenca_clara";
}

function expressionEvidence(candidate, dataset, expressionRows) {
  const features = candidate.associatedFeatures.filter((feature) => dataset.indexByName.has(feature));
  const disease = [];
  const healthy = [];

  for (const entry of expressionRows) {
    const value =
      features.reduce((sum, feature) => sum + (Number(entry.row[dataset.indexByName.get(feature)]) || 0), 0) /
      Math.max(1, features.length);
    if (entry.label === 1) disease.push(value);
    else if (entry.label === 0) healthy.push(value);
  }

  const diseaseMean = mean(disease);
  const healthyMean = mean(healthy);
  const diseaseLogged = disease.map((value) => Math.log1p(Math.max(0, value)));
  const healthyLogged = healthy.map((value) => Math.log1p(Math.max(0, value)));
  const auc = computeAuc(diseaseLogged, healthyLogged);
  const absAuc = Math.max(auc, 1 - auc);
  const log2FoldChange = Math.log2((diseaseMean + 1) / (healthyMean + 1));
  const diseaseNonzeroPct = (disease.filter((value) => value > 0).length / Math.max(1, disease.length)) * 100;
  const healthyNonzeroPct = (healthy.filter((value) => value > 0).length / Math.max(1, healthy.length)) * 100;
  const pooledStd = Math.sqrt((std(diseaseLogged) ** 2 + std(healthyLogged) ** 2) / 2) || 1;
  const cohenD = (mean(diseaseLogged) - mean(healthyLogged)) / pooledStd;
  const score = expressionScore({ absAuc, log2FoldChange, diseaseNonzeroPct, healthyNonzeroPct });

  return {
    features,
    score,
    diseaseMean,
    healthyMean,
    diseaseMedian: median(disease),
    healthyMedian: median(healthy),
    log2FoldChange,
    direction: directionFromLog2Fc(log2FoldChange),
    auc,
    absAuc,
    cohenD,
    diseaseNonzeroPct,
    healthyNonzeroPct,
  };
}

function leaveOnePositiveOutEvaluation(markerEntries, backgroundEntries) {
  const evaluations = [];
  for (let i = 0; i < markerEntries.length; i += 1) {
    const heldOut = markerEntries[i];
    const trainMarkers = markerEntries.filter((_, index) => index !== i);
    const model = trainContrastiveModel(trainMarkers, backgroundEntries, LOPO_EPOCHS);
    const scored = [
      {
        marker: markerDisplayName(heldOut.name),
        isHeldOut: true,
        score: sequenceModelScore(model, heldOut.sequence),
      },
      ...backgroundEntries.map((candidate) => ({
        marker: markerDisplayName(candidate.name),
        isHeldOut: false,
        score: sequenceModelScore(model, candidate.sequence),
      })),
    ].sort((a, b) => b.score - a.score);
    const rank = scored.findIndex((item) => item.isHeldOut) + 1;
    const percentile = 1 - (rank - 1) / Math.max(1, scored.length - 1);
    evaluations.push({
      marker: markerDisplayName(heldOut.name),
      score: sequenceModelScore(model, heldOut.sequence),
      rank,
      percentile,
      pool_size: scored.length,
    });
  }

  return evaluations;
}

function main() {
  for (const requiredPath of [FASTA_PATH, DATASET_CSV, POSITIVE_MARKERS_CSV]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`Arquivo obrigatorio nao encontrado: ${requiredPath}`);
  }

  const dataset = readCsv(DATASET_CSV);
  const classIndex = dataset.indexByName.get("classe");
  if (typeof classIndex !== "number") throw new Error(`Coluna classe ausente em ${DATASET_CSV}`);

  const featuresByFamily = new Map();
  for (const feature of dataset.header.slice(2)) {
    const family = precursorFamilyBase(feature);
    const current = featuresByFamily.get(family) ?? [];
    current.push(feature);
    featuresByFamily.set(family, current);
  }

  const matureEntries = readMatureFasta(FASTA_PATH);
  const byNormalizedName = new Map(matureEntries.map((entry) => [entry.normalizedName, entry]));
  const positiveMarkers = readPositiveMarkers();
  const markerEntries = positiveMarkers.map((marker) => resolveMarkerEntry(marker, byNormalizedName)).filter(Boolean);
  const knownNames = new Set(markerEntries.map((entry) => entry.normalizedName));
  const missingMarkers = positiveMarkers.filter(
    (marker) => !markerEntries.some((entry) => normalizeMarkerName(marker.resolved_mature_mirna || marker.mirna) === entry.normalizedName)
  );

  if (markerEntries.length < 5) {
    throw new Error(`Marcadores positivos insuficientes para treinar o modelo: ${markerEntries.length}`);
  }

  const candidateEntries = matureEntries
    .filter((entry) => featuresByFamily.has(entry.familyBase))
    .filter((entry) => !knownNames.has(entry.normalizedName))
    .map((entry) => ({
      ...entry,
      associatedFeatures: featuresByFamily.get(entry.familyBase) ?? [],
    }));

  const model = trainContrastiveModel(markerEntries, candidateEntries, TRAIN_EPOCHS);
  const lopo = leaveOnePositiveOutEvaluation(markerEntries, candidateEntries);
  const lopoMeanPercentile = mean(lopo.map((item) => item.percentile));
  const lopoTop10Pct = (lopo.filter((item) => item.percentile >= 0.9).length / lopo.length) * 100;

  const preRanked = candidateEntries.map((candidate) => {
    const rawSequenceLogit = sequenceModelLogit(model, candidate.sequence);
    return {
      candidate,
      rawSequenceLogit,
    };
  });

  const sortedBySequenceLogit = [...preRanked].sort((a, b) => a.rawSequenceLogit - b.rawSequenceLogit);
  const sequencePercentileByName = new Map();
  sortedBySequenceLogit.forEach((item, index) => {
    sequencePercentileByName.set(
      item.candidate.normalizedName,
      sortedBySequenceLogit.length === 1 ? 1 : index / (sortedBySequenceLogit.length - 1)
    );
  });

  const ranked = preRanked
    .map(({ candidate, rawSequenceLogit }) => {
      const sequenceScore = sequencePercentileByName.get(candidate.normalizedName) ?? 0;
      const sequenceProbability = sigmoid(rawSequenceLogit);
      const nearest = nearestMarkers(candidate, markerEntries, model.vocabulary);
      const topFeatures = topContributingFeatures(model, candidate.sequence);
      return {
        ...candidate,
        rawSequenceLogit,
        sequenceScore,
        sequenceProbability,
        nearest,
        topFeatures,
      };
    })
    .sort((a, b) => b.sequenceScore - a.sequenceScore);

  ensureDirectory(OUTPUT_MODEL);
  ensureDirectory(OUTPUT_RANKING);
  ensureDirectory(OUTPUT_REPORT);

  const sortedWeights = [...model.weights.entries()].sort((a, b) => b[1] - a[1]);
  const modelArtifact = {
    type: "trained_contrastive_one_class_kmer_model",
    purpose:
      "Priorizar miRNAs candidatos por semelhanca aprendida com miRNAs associados ao cancer de mama; nao classifica cancerigeno vs nao cancerigeno.",
    training_design:
      "Marcadores positivos conhecidos recebem rotulo positivo. Outros miRNAs humanos presentes no dataset sao usados apenas como background nao rotulado, nao como negativos biologicos.",
    source_fasta: FASTA_PATH,
    source_dataset_for_expression_test: DATASET_CSV,
    positive_markers_csv: POSITIVE_MARKERS_CSV,
    k_values: K_VALUES,
    vocabulary_size: model.vocabulary.size,
    epochs: TRAIN_EPOCHS,
    regularization_l2: L2,
    unlabeled_background_total_weight_ratio: UNLABELED_BACKGROUND_TOTAL_WEIGHT_RATIO,
    bias: model.bias,
    weights: Object.fromEntries(sortedWeights),
    top_positive_features: sortedWeights.slice(0, 50).map(([feature, weight]) => ({ feature, weight })),
    top_negative_features: sortedWeights.slice(-50).reverse().map(([feature, weight]) => ({ feature, weight })),
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
    missing_marker_sequences: missingMarkers,
    candidate_count: ranked.length,
    training_history: model.history,
    internal_recovery_validation: {
      method: "leave_one_positive_out_recovery_against_unlabeled_background",
      mean_percentile: lopoMeanPercentile,
      held_out_markers_in_top_10_percent: lopoTop10Pct,
      details: lopo,
      warning:
        "Esta validacao mede recuperacao de positivos conhecidos por padroes de sequencia. Nao e validacao clinica nem prova laboratorial.",
    },
    candidate_ranking_score_definition:
      "score_modelo_sequencial e o percentil do candidato pelo logit aprendido pelo modelo de k-mers; perto de 1 indica maior suporte sequencial relativo.",
    next_step:
      "Executar scripts/validate_mirna_candidates_in_patients_model.js para testar os candidatos no dataset de pacientes.",
  };
  fs.writeFileSync(OUTPUT_MODEL, JSON.stringify(modelArtifact, null, 2), "utf8");

  const outputHeader = [
    "rank",
    "mirna",
    "accession",
    "sequence",
    "score_modelo_sequencial",
    "probabilidade_contrastiva_bruta",
    "logit_modelo_sequencial",
    "features_expressao_associadas",
    "features_kmer_mais_influentes",
    "marcadores_referencia_mais_proximos",
  ];

  const outputRows = ranked.map((candidate, index) => [
    index + 1,
    markerDisplayName(candidate.name),
    candidate.accession,
    candidate.sequence,
    candidate.sequenceScore.toFixed(6),
    candidate.sequenceProbability.toFixed(6),
    candidate.rawSequenceLogit.toFixed(6),
    candidate.associatedFeatures.join("; "),
    candidate.topFeatures.map((item) => `${item.feature}:${item.contribution.toFixed(4)}`).join("; "),
    candidate.nearest.map((item) => `${item.marker}:${item.similarity.toFixed(3)}`).join("; "),
  ]);
  fs.writeFileSync(OUTPUT_RANKING, [outputHeader, ...outputRows].map((row) => row.map(csvCell).join(",")).join("\n"), "utf8");

  const top = ranked.slice(0, TOP_REPORT_COUNT);
  const report = [
    "Modelo de descoberta de candidatos miRNA por k-mers",
    "",
    `FASTA de referencia: ${FASTA_PATH}`,
    `CSV de biomarcadores positivos: ${POSITIVE_MARKERS_CSV}`,
    `Dataset usado para teste de expressao: ${DATASET_CSV}`,
    `Marcadores positivos com sequencia: ${markerEntries.length}`,
    `Candidatos avaliados com expressao disponivel: ${ranked.length}`,
    `Vocabulario aprendido: ${model.vocabulary.size} features de k-mer/seed`,
    "",
    "Tipo do modelo:",
    "trained_contrastive_one_class_kmer_model",
    "",
    "Como o treinamento foi feito:",
    "Os miRNAs associados ao cancer de mama foram usados como positivos. Os outros miRNAs humanos presentes no dataset foram usados apenas como background nao rotulado, e nao como classe nao cancerigena.",
    "O modelo aprendeu pesos para k-mers/seeds que diferenciam o perfil dos positivos em relacao ao background humano disponivel.",
    "",
    "Score do Modelo 1:",
    "score_modelo_sequencial = percentil do candidato pelo logit aprendido pelo modelo de k-mers",
    "",
    "Validacao interna de recuperacao de positivos conhecidos:",
    `LOPO percentil medio=${lopoMeanPercentile.toFixed(4)}`,
    `LOPO positivos recuperados no top 10%=${lopoTop10Pct.toFixed(2)}%`,
    "",
    "Top features aprendidas com peso positivo:",
    ...sortedWeights.slice(0, 15).map(([feature, weight]) => `${feature}\tpeso=${weight.toFixed(6)}`),
    "",
    "Top candidatos por padrao sequencial aprendido:",
    ...top.map(
      (candidate, index) =>
        `${index + 1}. ${markerDisplayName(candidate.name)}\t` +
        `modelo_seq_percentil=${candidate.sequenceScore.toFixed(4)}\t` +
        `prob_contrastiva=${candidate.sequenceProbability.toFixed(4)}\t` +
        `logit=${candidate.rawSequenceLogit.toFixed(4)}\t` +
        `features=${candidate.associatedFeatures.join(", ")}\t` +
        `referencias=${candidate.nearest.map((item) => `${item.marker}:${item.similarity.toFixed(3)}`).join(", ")}`
    ),
    "",
    "Como interpretar:",
    "O score_modelo_sequencial e o percentil do candidato pelo logit aprendido pelo modelo de k-mers; perto de 1 indica maior suporte sequencial relativo.",
    "A probabilidade_contrastiva_bruta e mantida para auditoria, mas nao deve ser lida como probabilidade clinica.",
    "Este primeiro modelo nao usa as classes dos pacientes; ele apenas aprende padroes sequenciais dos positivos e encontra candidatos na lista de miRNAs do projeto.",
    "A validacao computacional em pacientes deve ser feita no segundo modelo.",
    "",
    "Aviso cientifico:",
    "O modelo nao prova que um miRNA e cancerigeno. Ele prioriza candidatos hipoteticos para investigacao com base em padroes de sequencia e evidencia computacional no dataset atual.",
    "A separacao por expressao pode refletir efeito de lote/fonte entre doentes e saudaveis.",
    "",
  ].join("\n");

  fs.writeFileSync(OUTPUT_REPORT, report, "utf8");
  console.log(report);
}

main();
