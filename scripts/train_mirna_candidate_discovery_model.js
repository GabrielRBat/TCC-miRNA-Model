const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const projectPath = (filePath) => path.relative(ROOT, filePath).split(path.sep).join("/");

const FASTA_PATH = fromRoot("data", "external", "mirbase_mature.fa");
const DATASET_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const POSITIVE_MARKERS_CSV = fromRoot("data", "external", "breast_cancer_mirna_positive_markers.csv");
const TRAINING_POLICY_CSV = fromRoot("data", "external", "breast_cancer_mirna_training_policy.csv");
const OUTPUT_MODEL = fromRoot("models", "modelo_mirna_candidate_discovery.json");
const OUTPUT_RANKING = fromRoot("data", "processed", "mirna_candidate_discovery_model_ranking.csv");
const OUTPUT_REPORT = fromRoot("reports", "modelo_mirna_candidate_discovery_report.txt");

const TOP_REPORT_COUNT = 30;
const OUTER_FOLDS = 5;
const INNER_FOLDS = 3;
const INNER_EPOCHS = 70;
const OUTER_EPOCHS = 150;
const FINAL_EPOCHS = 420;
const INNER_PU_BAGS = 1;
const OUTER_PU_BAGS = 3;
const FINAL_PU_BAGS = 20;
const INNER_BAG_SIZE = 450;
const OUTER_BAG_SIZE = 650;
const FINAL_BAG_SIZE = 800;
const MONTE_CARLO_ITERATIONS = 10000;
const BOOTSTRAP_ITERATIONS = 4000;
const LEARNING_RATE = 0.8;

const MODEL_CONFIGS = [
  {
    id: "k234_core_mature_l2_003_u050",
    kValues: [2, 3, 4],
    featureSet: "core",
    l2: 0.03,
    l1: 0,
    unlabeledWeightRatio: 0.5,
    minimumFeatureWeight: 2,
  },
  {
    id: "k234_composition_mature_l2_003_u050",
    kValues: [2, 3, 4],
    featureSet: "composition",
    l2: 0.03,
    l1: 0,
    unlabeledWeightRatio: 0.5,
    minimumFeatureWeight: 2,
  },
  {
    id: "k234_positional_mature_l2_003_u050",
    kValues: [2, 3, 4],
    featureSet: "positional",
    l2: 0.03,
    l1: 0,
    unlabeledWeightRatio: 0.5,
    minimumFeatureWeight: 2,
  },
  {
    id: "k234_terminals_mature_l2_003_u050",
    kValues: [2, 3, 4],
    featureSet: "terminals",
    l2: 0.03,
    l1: 0,
    unlabeledWeightRatio: 0.5,
    minimumFeatureWeight: 2,
  },
  {
    id: "k234_full_mature_l2_003_u050",
    kValues: [2, 3, 4],
    featureSet: "full",
    l2: 0.03,
    l1: 0,
    unlabeledWeightRatio: 0.5,
    minimumFeatureWeight: 2,
  },
  {
    id: "k234_full_mature_elastic_l1_001",
    kValues: [2, 3, 4],
    featureSet: "full",
    l2: 0.03,
    l1: 0.01,
    unlabeledWeightRatio: 0.5,
    minimumFeatureWeight: 2,
  },
  {
    id: "k2345_full_mature_l2_003_u050",
    kValues: [2, 3, 4, 5],
    featureSet: "full",
    l2: 0.03,
    l1: 0,
    unlabeledWeightRatio: 0.5,
    minimumFeatureWeight: 2,
  },
  {
    id: "k234567_full_mature_elastic_l1_001",
    kValues: [2, 3, 4, 5, 6, 7],
    featureSet: "full",
    l2: 0.05,
    l1: 0.01,
    unlabeledWeightRatio: 0.4,
    minimumFeatureWeight: 2,
  },
];

const MATURE_FEATURE_ABLATIONS = ["core", "composition", "positional", "terminals", "full"].map((featureSet) => ({
  id: `ablation_k234_${featureSet}`,
  kValues: [2, 3, 4],
  featureSet,
  l2: 0.03,
  l1: 0,
  unlabeledWeightRatio: 0.5,
  minimumFeatureWeight: 2,
}));

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
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === ",") {
      out.push(value);
      value = "";
    } else if (character === '"' && value.length === 0) quoted = true;
    else value += character;
  }
  out.push(value);
  return out;
}

function readCsv(filePath) {
  const rows = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
  const header = rows[0];
  return { header, rows: rows.slice(1), indexByName: new Map(header.map((name, index) => [name, index])) };
}

function normalizeSequence(sequence) {
  return String(sequence ?? "").toUpperCase().replaceAll("T", "U").replace(/[^ACGU]/g, "");
}

function normalizeMarkerName(name) {
  const lower = String(name ?? "").trim().toLowerCase();
  if (lower.startsWith("hsa-")) return lower;
  if (lower.startsWith("mir-") || lower.startsWith("let-")) return `hsa-${lower}`;
  return lower;
}

function precursorFamilyBase(name) {
  const normalized = normalizeMarkerName(name);
  const locusMatch = normalized.match(/^(hsa-(?:mir|let)-.+)-\d+$/);
  return locusMatch ? locusMatch[1] : normalized;
}

function matureFamilyBase(name) {
  return precursorFamilyBase(normalizeMarkerName(name).replace(/-[35]p$/, ""));
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

function readFasta(filePath) {
  const entries = [];
  let header = null;
  let sequence = "";
  const flush = () => {
    if (header) entries.push(parseFastaEntry(header, sequence));
  };
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith(">")) {
      flush();
      header = line.slice(1);
      sequence = "";
    } else sequence += line.trim();
  }
  flush();
  return entries.filter((entry) => entry.name.startsWith("hsa-") && entry.sequence.length > 0);
}

function readPositiveMarkers() {
  const bibliography = readCsv(POSITIVE_MARKERS_CSV);
  const policy = readCsv(TRAINING_POLICY_CSV);
  for (const column of ["mirna", "resolved_mature_mirna"]) {
    if (!bibliography.indexByName.has(column)) throw new Error(`Coluna obrigatoria ausente em ${POSITIVE_MARKERS_CSV}: ${column}`);
  }
  for (const column of ["resolved_mature_mirna", "training_tier", "training_weight", "use_in_training"]) {
    if (!policy.indexByName.has(column)) throw new Error(`Coluna obrigatoria ausente em ${TRAINING_POLICY_CSV}: ${column}`);
  }
  const policyByMarker = new Map();
  for (const row of policy.rows) {
    const item = Object.fromEntries(policy.header.map((name, index) => [name, row[index] ?? ""]));
    const key = normalizeMarkerName(item.resolved_mature_mirna);
    const weight = Number(item.training_weight);
    const use = item.use_in_training.trim().toLowerCase();
    if (!key || policyByMarker.has(key)) throw new Error(`Politica vazia ou duplicada para ${key || "<vazio>"}`);
    if (!item.training_tier.trim() || !Number.isFinite(weight) || weight <= 0 || !["sim", "nao"].includes(use)) throw new Error(`Politica de treinamento invalida para ${key}`);
    policyByMarker.set(key, item);
  }
  const seen = new Set();
  const markers = [];
  for (const row of bibliography.rows) {
    const metadata = Object.fromEntries(bibliography.header.map((name, index) => [name, row[index] ?? ""]));
    const mirna = metadata.mirna?.trim();
    const resolved = metadata.resolved_mature_mirna?.trim() || mirna;
    if (!mirna || !resolved) continue;
    const key = normalizeMarkerName(resolved);
    if (seen.has(key)) throw new Error(`Marcador positivo duplicado: ${resolved}`);
    const trainingPolicy = policyByMarker.get(key);
    if (!trainingPolicy) throw new Error(`Politica de treinamento ausente para ${resolved}`);
    seen.add(key);
    markers.push({ ...metadata, training_tier: trainingPolicy.training_tier, training_weight: trainingPolicy.training_weight, use_in_training: trainingPolicy.use_in_training, training_note: trainingPolicy.training_note ?? "", mirna, resolved_mature_mirna: resolved });
  }
  const unusedPolicies = [...policyByMarker.keys()].filter((key) => !seen.has(key));
  if (unusedPolicies.length) throw new Error(`Politicas sem marcador bibliografico: ${unusedPolicies.join(", ")}`);
  return markers;
}

function markerEvidenceWeight(entry) {
  const explicit = Number(entry.markerMetadata?.training_weight);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : 1;
}

function resolveMarkerEntry(marker, byNormalizedName) {
  const resolved = normalizeMarkerName(marker.resolved_mature_mirna || marker.mirna);
  const exact = byNormalizedName.get(resolved);
  if (exact) return { ...exact, markerMetadata: marker, requestedName: marker.mirna, resolutionMethod: "exact" };
  const family = matureFamilyBase(marker.mirna);
  const candidates = [...byNormalizedName.values()].filter((entry) => entry.familyBase === family);
  if (!candidates.length) return null;
  const preferred = candidates.find((entry) => entry.normalizedName.endsWith("-5p")) ?? candidates.find((entry) => entry.normalizedName.endsWith("-3p")) ?? candidates[0];
  return { ...preferred, markerMetadata: marker, requestedName: marker.mirna, resolutionMethod: "family_preferred" };
}

function seedRegion(sequence) {
  return sequence.slice(1, 8);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function quantile(values, probability) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function allKmers(sequence, kValues) {
  const kmers = [];
  for (const size of kValues) for (let index = 0; index <= sequence.length - size; index += 1) kmers.push(sequence.slice(index, index + size));
  return kmers;
}

function normalizedSequenceVector(sequence, prefix, kValues, includeSeed = false) {
  const vector = new Map();
  for (const kmer of allKmers(sequence, kValues)) {
    const feature = `${prefix}:kmer:${kmer}`;
    vector.set(feature, (vector.get(feature) ?? 0) + 1);
  }
  if (includeSeed) vector.set(`${prefix}:seed:${seedRegion(sequence)}`, 2);
  const total = [...vector.values()].reduce((sum, value) => sum + value, 0);
  if (total > 0) for (const [feature, value] of vector.entries()) vector.set(feature, value / total);
  return vector;
}

function gcFraction(sequence) {
  return [...sequence].filter((base) => base === "G" || base === "C").length / Math.max(1, sequence.length);
}

function nucleotideFractions(sequence) {
  const denominator = Math.max(1, sequence.length);
  return Object.fromEntries(["A", "C", "G", "U"].map((base) => [base, [...sequence].filter((value) => value === base).length / denominator]));
}

function normalizedSequenceEntropy(sequence) {
  const fractions = Object.values(nucleotideFractions(sequence));
  const bits = -fractions.filter((value) => value > 0).reduce((sum, value) => sum + value * Math.log2(value), 0);
  return bits / 2;
}

function addPositionalKmers(vector, sequence, kValues) {
  let total = 0;
  for (const size of kValues) {
    for (let index = 0; index <= sequence.length - size; index += 1) {
      const relativeCenter = (index + size / 2) / Math.max(1, sequence.length);
      const region = relativeCenter < 1 / 3 ? "5p" : relativeCenter < 2 / 3 ? "center" : "3p";
      const feature = `mature:positional:${region}:kmer:${sequence.slice(index, index + size)}`;
      vector.set(feature, (vector.get(feature) ?? 0) + 1);
      total += 1;
    }
  }
  if (total > 0) {
    for (const [feature, value] of vector.entries()) {
      if (feature.startsWith("mature:positional:")) vector.set(feature, value / total);
    }
  }
}

function addTerminalMotifs(vector, sequence) {
  for (const size of [2, 3, 4]) {
    if (sequence.length < size) continue;
    vector.set(`mature:terminal:5p:${size}:${sequence.slice(0, size)}`, 0.25);
    vector.set(`mature:terminal:3p:${size}:${sequence.slice(-size)}`, 0.25);
  }
}

function sequenceVector(entry, config, vocabulary = null) {
  const mature = normalizedSequenceVector(entry.sequence, "mature", config.kValues, true);
  mature.set("mature:composition:length", Math.min(1, entry.sequence.length / 30));
  mature.set("mature:composition:gc_fraction", gcFraction(entry.sequence));
  if (["composition", "full"].includes(config.featureSet)) {
    for (const [base, fraction] of Object.entries(nucleotideFractions(entry.sequence))) mature.set(`mature:composition:base_${base}`, fraction);
    mature.set("mature:composition:entropy", normalizedSequenceEntropy(entry.sequence));
  }
  if (["positional", "full"].includes(config.featureSet)) addPositionalKmers(mature, entry.sequence, config.kValues.filter((value) => value <= 4));
  if (["terminals", "full"].includes(config.featureSet)) addTerminalMotifs(mature, entry.sequence);
  if (!vocabulary) return mature;
  return new Map([...mature.entries()].filter(([feature]) => vocabulary.has(feature)));
}

function balancedPositiveWeights(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(seedRegion(entry.sequence), (counts.get(seedRegion(entry.sequence)) ?? 0) + 1);
  const raw = new Map();
  let evidenceTotal = 0;
  let balancedTotal = 0;
  for (const entry of entries) {
    const evidence = markerEvidenceWeight(entry);
    const value = evidence / counts.get(seedRegion(entry.sequence));
    raw.set(entry.normalizedName, value);
    evidenceTotal += evidence;
    balancedTotal += value;
  }
  const scale = evidenceTotal / Math.max(1e-12, balancedTotal);
  return new Map([...raw.entries()].map(([name, value]) => [name, value * scale]));
}

function buildVocabulary(positiveEntries, config, positiveWeights) {
  const weightedPresence = new Map();
  for (const entry of positiveEntries) {
    const weight = positiveWeights.get(entry.normalizedName) ?? 1;
    for (const feature of new Set(sequenceVector(entry, config).keys())) weightedPresence.set(feature, (weightedPresence.get(feature) ?? 0) + weight);
  }
  return new Set([...weightedPresence.entries()].filter(([feature, weight]) => feature.includes(":seed:") || feature.includes(":composition:") || weight >= config.minimumFeatureWeight).map(([feature]) => feature));
}

function sigmoid(value) {
  if (value < -35) return 0;
  if (value > 35) return 1;
  return 1 / (1 + Math.exp(-value));
}

function dot(weights, vector) {
  let result = 0;
  for (const [feature, amount] of vector.entries()) result += (weights.get(feature) ?? 0) * amount;
  return result;
}

function deterministicBag(entries, size, bagIndex, salt) {
  if (entries.length <= size) return entries;
  return [...entries].sort((left, right) => stableHash(`${salt}|${bagIndex}|${left.normalizedName}`) - stableHash(`${salt}|${bagIndex}|${right.normalizedName}`) || left.normalizedName.localeCompare(right.normalizedName)).slice(0, size);
}

function trainSingleContrastModel(positiveEntries, unlabeledEntries, config, epochs, vocabulary, positiveWeights) {
  const positiveTotalWeight = [...positiveWeights.values()].reduce((sum, value) => sum + value, 0);
  const unlabeledWeight = positiveTotalWeight * config.unlabeledWeightRatio / Math.max(1, unlabeledEntries.length);
  const samples = [
    ...positiveEntries.map((entry) => ({ label: 1, weight: positiveWeights.get(entry.normalizedName) ?? 1, vector: sequenceVector(entry, config, vocabulary) })),
    ...unlabeledEntries.map((entry) => ({ label: 0, weight: unlabeledWeight, vector: sequenceVector(entry, config, vocabulary) })),
  ];
  const weights = new Map([...vocabulary].map((feature) => [feature, 0]));
  let bias = Math.log((positiveTotalWeight + 1) / (positiveTotalWeight * config.unlabeledWeightRatio + 1));
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
      for (const [feature, amount] of sample.vector.entries()) gradients.set(feature, (gradients.get(feature) ?? 0) + error * amount);
    }
    const learningRate = LEARNING_RATE / Math.sqrt(1 + epoch / 80);
    for (const feature of vocabulary) {
      const current = weights.get(feature) ?? 0;
      const gradient = (gradients.get(feature) ?? 0) / Math.max(1, totalWeight) + config.l2 * current;
      const proposed = current - learningRate * gradient;
      const threshold = learningRate * (config.l1 ?? 0);
      const regularized = Math.sign(proposed) * Math.max(0, Math.abs(proposed) - threshold);
      weights.set(feature, regularized);
    }
    bias -= learningRate * biasGradient / Math.max(1, totalWeight);
    if (epoch === 0 || (epoch + 1) % 100 === 0 || epoch === epochs - 1) history.push({ epoch: epoch + 1, weighted_log_loss: weightedLoss / Math.max(1, totalWeight) });
  }
  return { weights, bias, history };
}

function trainPuEnsemble(positiveEntries, unlabeledEntries, config, options) {
  const positiveWeights = balancedPositiveWeights(positiveEntries);
  const vocabulary = buildVocabulary(positiveEntries, config, positiveWeights);
  const models = [];
  for (let bagIndex = 0; bagIndex < options.bags; bagIndex += 1) {
    const bag = deterministicBag(unlabeledEntries, Math.min(options.bagSize, unlabeledEntries.length), bagIndex, options.salt);
    const trained = trainSingleContrastModel(positiveEntries, bag, config, options.epochs, vocabulary, positiveWeights);
    models.push({ ...trained, unlabeledNames: new Set(bag.map((entry) => entry.normalizedName)) });
  }
  const consensusWeights = new Map([...vocabulary].map((feature) => [feature, mean(models.map((model) => model.weights.get(feature) ?? 0))]));
  return { vocabulary, weights: consensusWeights, bias: mean(models.map((model) => model.bias)), config, bagCount: options.bags, bagSize: Math.min(options.bagSize, unlabeledEntries.length), memberModels: models, histories: models.map((model, index) => ({ bag: index + 1, history: model.history })) };
}

function modelLogit(model, entry) {
  return model.bias + dot(model.weights, sequenceVector(entry, model.config, model.vocabulary));
}

function outOfBagLogit(model, entry) {
  const vector = sequenceVector(entry, model.config, model.vocabulary);
  const outOfBagModels = model.memberModels.filter((member) => !member.unlabeledNames.has(entry.normalizedName));
  const eligibleModels = outOfBagModels.length ? outOfBagModels : model.memberModels;
  return {
    logit: mean(eligibleModels.map((member) => member.bias + dot(member.weights, vector))),
    modelCount: eligibleModels.length,
    usedFallback: outOfBagModels.length === 0,
    scoringModels: eligibleModels,
  };
}

function candidateOutOfBagStability(model, entries) {
  const percentilesByName = new Map(entries.map((entry) => [entry.normalizedName, []]));
  for (const member of model.memberModels) {
    const eligible = entries.filter((entry) => !member.unlabeledNames.has(entry.normalizedName)).map((entry) => ({
      entry,
      score: member.bias + dot(member.weights, sequenceVector(entry, model.config, model.vocabulary)),
    })).sort((left, right) => left.score - right.score || left.entry.normalizedName.localeCompare(right.entry.normalizedName));
    for (let index = 0; index < eligible.length; index += 1) {
      const percentile = eligible.length === 1 ? 1 : index / (eligible.length - 1);
      percentilesByName.get(eligible[index].entry.normalizedName).push(percentile);
    }
  }
  return new Map([...percentilesByName.entries()].map(([name, values]) => [name, {
    out_of_bag_bags: values.length,
    median_percentile: quantile(values, 0.5),
    percentile_q25: quantile(values, 0.25),
    percentile_q75: quantile(values, 0.75),
    percentile_iqr: quantile(values, 0.75) - quantile(values, 0.25),
    top_1_frequency: values.filter((value) => value >= 0.99).length / Math.max(1, values.length),
    top_5_frequency: values.filter((value) => value >= 0.95).length / Math.max(1, values.length),
    top_10_frequency: values.filter((value) => value >= 0.9).length / Math.max(1, values.length),
    top_20_frequency: values.filter((value) => value >= 0.8).length / Math.max(1, values.length),
  }]));
}

function cosineSimilarity(left, right) {
  let product = 0;
  let normLeft = 0;
  let normRight = 0;
  for (const value of left.values()) normLeft += value * value;
  for (const value of right.values()) normRight += value * value;
  for (const [feature, value] of left.entries()) product += value * (right.get(feature) ?? 0);
  return normLeft && normRight ? product / Math.sqrt(normLeft * normRight) : 0;
}

function meanVector(vectors) {
  const output = new Map();
  for (const vector of vectors) for (const [feature, value] of vector.entries()) output.set(feature, (output.get(feature) ?? 0) + value / Math.max(1, vectors.length));
  return output;
}

function seedSimilarity(entry, trainingMarkers) {
  const seed = seedRegion(entry.sequence);
  return Math.max(...trainingMarkers.map((marker) => {
    const reference = seedRegion(marker.sequence);
    let matches = 0;
    for (let index = 0; index < Math.min(seed.length, reference.length); index += 1) if (seed[index] === reference[index]) matches += 1;
    return matches / Math.max(seed.length, reference.length, 1);
  }));
}

function buildBaselineScorers(trainingMarkers, model, config, foldIndex) {
  const matureCentroid = meanVector(trainingMarkers.map((entry) => normalizedSequenceVector(entry.sequence, "baseline", config.kValues, false)));
  const meanLength = mean(trainingMarkers.map((entry) => entry.sequence.length));
  const meanGc = mean(trainingMarkers.map((entry) => gcFraction(entry.sequence)));
  const compositionSimilarity = (entry) => {
    const lengthDistance = Math.abs(entry.sequence.length - meanLength) / Math.max(1, meanLength);
    const gcDistance = Math.abs(gcFraction(entry.sequence) - meanGc);
    return 1 - Math.min(1, (lengthDistance + gcDistance) / 2);
  };
  return {
    modelo_pu_maduro: (entry) => modelLogit(model, entry),
    similaridade_seed: (entry) => seedSimilarity(entry, trainingMarkers),
    centroide_kmer_maduro: (entry) => cosineSimilarity(normalizedSequenceVector(entry.sequence, "baseline", config.kValues, false), matureCentroid),
    similaridade_composicao_madura: compositionSimilarity,
    ranking_aleatorio_deterministico: (entry) => stableHash(`random-baseline|${foldIndex}|${entry.normalizedName}`) / 0xffffffff,
  };
}

function evaluateScorer(heldOutMarkers, backgroundEntries, scorer, fold, modelId) {
  const backgroundScores = backgroundEntries.map((entry) => ({ entry, score: scorer(entry) }));
  return heldOutMarkers.map((heldOut) => {
    const heldScore = scorer(heldOut);
    const heldSeed = seedRegion(heldOut.sequence);
    const eligible = backgroundScores.filter((item) => seedRegion(item.entry.sequence) !== heldSeed);
    let greater = 0;
    let tied = 0;
    for (const item of eligible) {
      if (item.score > heldScore) greater += 1;
      else if (item.score === heldScore) tied += 1;
    }
    return { marker: markerDisplayName(heldOut.name), seed_family: heldSeed, outer_fold: fold, selected_model_config: modelId, score: heldScore, rank: 1 + greater + tied / 2, percentile: 1 - (greater + tied / 2) / Math.max(1, eligible.length), pool_size: eligible.length + 1 };
  });
}

function metricsFromPercentiles(items) {
  const percentiles = items.map((item) => item.percentile);
  const result = { count: items.length, mean_percentile: mean(percentiles) };
  for (const cutoff of [1, 5, 10, 20]) {
    const recovered = percentiles.filter((value) => value >= 1 - cutoff / 100).length;
    result[`recovered_at_${cutoff}_percent`] = recovered;
    result[`recall_at_${cutoff}_percent`] = recovered / Math.max(1, percentiles.length);
  }
  return result;
}

function aggregateValidation(evaluations) {
  const byFamily = new Map();
  for (const evaluation of evaluations) {
    const current = byFamily.get(evaluation.seed_family) ?? [];
    current.push(evaluation);
    byFamily.set(evaluation.seed_family, current);
  }
  const families = [...byFamily.entries()].map(([seed, items]) => ({ seed_family: seed, marker_count: items.length, percentile: mean(items.map((item) => item.percentile)), best_percentile: Math.max(...items.map((item) => item.percentile)), markers: items.map((item) => item.marker) }));
  return { marker_metrics: metricsFromPercentiles(evaluations), family_metrics: metricsFromPercentiles(families), family_details: families };
}

function makeFamilyFolds(markerEntries, foldCount, salt) {
  const families = [...new Set(markerEntries.map((entry) => seedRegion(entry.sequence)))].sort((left, right) => stableHash(`${salt}|${left}`) - stableHash(`${salt}|${right}`) || left.localeCompare(right));
  const folds = Array.from({ length: Math.min(foldCount, families.length) }, () => []);
  families.forEach((family, index) => folds[index % folds.length].push(family));
  return folds;
}

function selectConfiguration(trainingMarkers, backgroundEntries, outerFold) {
  const innerFolds = makeFamilyFolds(trainingMarkers, INNER_FOLDS, `inner-${outerFold}`);
  const comparisons = [];
  for (const config of MODEL_CONFIGS) {
    const evaluations = [];
    for (let index = 0; index < innerFolds.length; index += 1) {
      const heldFamilies = new Set(innerFolds[index]);
      const train = trainingMarkers.filter((entry) => !heldFamilies.has(seedRegion(entry.sequence)));
      const held = trainingMarkers.filter((entry) => heldFamilies.has(seedRegion(entry.sequence)));
      const model = trainPuEnsemble(train, backgroundEntries, config, { bags: INNER_PU_BAGS, bagSize: INNER_BAG_SIZE, epochs: INNER_EPOCHS, salt: `inner-${outerFold}-${index}-${config.id}` });
      evaluations.push(...evaluateScorer(held, backgroundEntries, (entry) => modelLogit(model, entry), index + 1, config.id));
    }
    comparisons.push({ config, metrics: aggregateValidation(evaluations) });
  }
  comparisons.sort((left, right) => right.metrics.family_metrics.mean_percentile - left.metrics.family_metrics.mean_percentile || right.metrics.family_metrics.recall_at_10_percent - left.metrics.family_metrics.recall_at_10_percent || left.config.id.localeCompare(right.config.id));
  return { selected: comparisons[0].config, comparisons };
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapFamilyIntervals(familyDetails) {
  const random = mulberry32(0x54c043);
  const means = [];
  const recalls = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    const sampled = Array.from({ length: familyDetails.length }, () => familyDetails[Math.floor(random() * familyDetails.length)]);
    means.push(mean(sampled.map((item) => item.percentile)));
    recalls.push(sampled.filter((item) => item.percentile >= 0.9).length / sampled.length);
  }
  return { method: "bootstrap_by_seed_family", iterations: BOOTSTRAP_ITERATIONS, mean_percentile_95_ci: [quantile(means, 0.025), quantile(means, 0.975)], recall_at_10_percent_95_ci: [quantile(recalls, 0.025), quantile(recalls, 0.975)] };
}

function randomRankingTest(familyMetrics, familyDetails) {
  const random = mulberry32(0x50a17e);
  let meanAtLeastObserved = 0;
  let recallAtLeastObserved = 0;
  for (let iteration = 0; iteration < MONTE_CARLO_ITERATIONS; iteration += 1) {
    const values = familyDetails.map((family) =>
      mean(Array.from({ length: family.marker_count }, () => random()))
    );
    if (mean(values) >= familyMetrics.mean_percentile) meanAtLeastObserved += 1;
    if (values.filter((value) => value >= 0.9).length >= familyMetrics.recovered_at_10_percent) recallAtLeastObserved += 1;
  }
  return { method: "deterministic_random_ranking_monte_carlo_preserving_family_marker_counts", iterations: MONTE_CARLO_ITERATIONS, preserves_marker_count_per_seed_family: true, p_value_mean_percentile: (meanAtLeastObserved + 1) / (MONTE_CARLO_ITERATIONS + 1), p_value_recall_at_10_percent: (recallAtLeastObserved + 1) / (MONTE_CARLO_ITERATIONS + 1) };
}

function pairedFeatureComparison(reference, alternative, alternativeName) {
  const alternativeByFamily = new Map(alternative.family_details.map((item) => [item.seed_family, item.percentile]));
  const deltas = reference.family_details.map((item) => alternativeByFamily.get(item.seed_family) - item.percentile);
  const observed = mean(deltas);
  const bootstrapRandom = mulberry32(stableHash(`feature-bootstrap|${alternativeName}`));
  const bootstrapMeans = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    bootstrapMeans.push(mean(Array.from({ length: deltas.length }, () => deltas[Math.floor(bootstrapRandom() * deltas.length)])));
  }
  const permutationRandom = mulberry32(stableHash(`feature-sign-flip|${alternativeName}`));
  let atLeastObserved = 0;
  for (let iteration = 0; iteration < MONTE_CARLO_ITERATIONS; iteration += 1) {
    const permuted = mean(deltas.map((delta) => (permutationRandom() < 0.5 ? delta : -delta)));
    if (Math.abs(permuted) >= Math.abs(observed)) atLeastObserved += 1;
  }
  return {
    reference: "core",
    alternative: alternativeName,
    mean_paired_delta: observed,
    bootstrap_95_ci: [quantile(bootstrapMeans, 0.025), quantile(bootstrapMeans, 0.975)],
    paired_sign_flip_p_value_two_sided: (atLeastObserved + 1) / (MONTE_CARLO_ITERATIONS + 1),
    families_improved: deltas.filter((value) => value > 1e-12).length,
    families_tied: deltas.filter((value) => Math.abs(value) <= 1e-12).length,
    families_worsened: deltas.filter((value) => value < -1e-12).length,
  };
}

function addBenjaminiHochbergFdr(comparisons) {
  const ordered = Object.values(comparisons).sort((left, right) => left.paired_sign_flip_p_value_two_sided - right.paired_sign_flip_p_value_two_sided);
  let runningMinimum = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const adjusted = Math.min(1, ordered[index].paired_sign_flip_p_value_two_sided * ordered.length / (index + 1));
    runningMinimum = Math.min(runningMinimum, adjusted);
    ordered[index].paired_sign_flip_fdr_bh = runningMinimum;
  }
}

function summarizeFeatureAblation(evaluationsByFeatureSet) {
  const representations = {};
  for (const [featureSet, evaluations] of evaluationsByFeatureSet.entries()) {
    const aggregated = aggregateValidation(evaluations);
    representations[featureSet] = {
      marker_metrics: aggregated.marker_metrics,
      family_metrics: aggregated.family_metrics,
      family_details: aggregated.family_details,
      bootstrap_95_ci: bootstrapFamilyIntervals(aggregated.family_details),
    };
  }
  const comparisonsAgainstCore = {};
  for (const featureSet of Object.keys(representations).filter((name) => name !== "core")) {
    comparisonsAgainstCore[featureSet] = pairedFeatureComparison(representations.core, representations[featureSet], featureSet);
  }
  addBenjaminiHochbergFdr(comparisonsAgainstCore);
  return {
    design: "comparacao externa pareada; mesmos folds por familia, background, bags PU, k=2/3/4, L2 e peso nao rotulado; apenas o bloco de features muda; FDR BH corrige as quatro comparacoes contra o core",
    representations,
    paired_comparisons_against_core: comparisonsAgainstCore,
  };
}

function runNestedFamilyValidation(markerEntries, backgroundEntries) {
  const outerFolds = makeFamilyFolds(markerEntries, OUTER_FOLDS, "outer");
  const evaluationsByMethod = new Map();
  const featureAblationEvaluations = new Map();
  const foldSelections = [];
  for (let foldIndex = 0; foldIndex < outerFolds.length; foldIndex += 1) {
    const heldFamilies = new Set(outerFolds[foldIndex]);
    const train = markerEntries.filter((entry) => !heldFamilies.has(seedRegion(entry.sequence)));
    const held = markerEntries.filter((entry) => heldFamilies.has(seedRegion(entry.sequence)));
    const tuning = selectConfiguration(train, backgroundEntries, foldIndex + 1);
    const config = tuning.selected;
    const model = trainPuEnsemble(train, backgroundEntries, config, { bags: OUTER_PU_BAGS, bagSize: OUTER_BAG_SIZE, epochs: OUTER_EPOCHS, salt: `outer-${foldIndex + 1}-${config.id}` });
    for (const [method, scorer] of Object.entries(buildBaselineScorers(train, model, config, foldIndex + 1))) {
      const current = evaluationsByMethod.get(method) ?? [];
      current.push(...evaluateScorer(held, backgroundEntries, scorer, foldIndex + 1, config.id));
      evaluationsByMethod.set(method, current);
    }
    const sharedAblationSalt = `outer-feature-ablation-${foldIndex + 1}`;
    for (const ablationConfig of MATURE_FEATURE_ABLATIONS) {
      const ablationModel = trainPuEnsemble(train, backgroundEntries, ablationConfig, { bags: OUTER_PU_BAGS, bagSize: OUTER_BAG_SIZE, epochs: OUTER_EPOCHS, salt: sharedAblationSalt });
      const current = featureAblationEvaluations.get(ablationConfig.featureSet) ?? [];
      current.push(...evaluateScorer(held, backgroundEntries, (entry) => modelLogit(ablationModel, entry), foldIndex + 1, ablationConfig.id));
      featureAblationEvaluations.set(ablationConfig.featureSet, current);
    }
    foldSelections.push({ outer_fold: foldIndex + 1, held_out_seed_families: [...heldFamilies], held_out_marker_count: held.length, selected_config: config.id, inner_comparison: tuning.comparisons.map((item) => ({ config: item.config.id, family_mean_percentile: item.metrics.family_metrics.mean_percentile, family_recall_at_10_percent: item.metrics.family_metrics.recall_at_10_percent })) });
    console.log(`Validacao externa ${foldIndex + 1}/${outerFolds.length}: ${config.id}`);
  }
  const methods = {};
  for (const [method, evaluations] of evaluationsByMethod.entries()) methods[method] = { ...aggregateValidation(evaluations), marker_details: evaluations };
  methods.modelo_pu_maduro.bootstrap_95_ci = bootstrapFamilyIntervals(methods.modelo_pu_maduro.family_details);
  methods.modelo_pu_maduro.random_ranking_test = randomRankingTest(
    methods.modelo_pu_maduro.family_metrics,
    methods.modelo_pu_maduro.family_details
  );
  return {
    outer_folds: outerFolds.length,
    inner_folds: INNER_FOLDS,
    fold_selections: foldSelections,
    methods,
    mature_feature_ablation: summarizeFeatureAblation(featureAblationEvaluations),
  };
}

function chooseFinalConfiguration(foldSelections) {
  const counts = new Map();
  const scores = new Map();
  for (const fold of foldSelections) {
    counts.set(fold.selected_config, (counts.get(fold.selected_config) ?? 0) + 1);
    for (const item of fold.inner_comparison) {
      const current = scores.get(item.config) ?? [];
      current.push(item.family_mean_percentile);
      scores.set(item.config, current);
    }
  }
  return [...MODEL_CONFIGS].sort((left, right) => (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0) || mean(scores.get(right.id) ?? [0]) - mean(scores.get(left.id) ?? [0]) || left.id.localeCompare(right.id))[0];
}

function topContributingFeatures(model, entry, limit = 10, scoringModels = null) {
  const featureWeight = (feature) => scoringModels?.length
    ? mean(scoringModels.map((member) => member.weights.get(feature) ?? 0))
    : model.weights.get(feature) ?? 0;
  return [...sequenceVector(entry, model.config, model.vocabulary).entries()].map(([feature, amount]) => ({ feature, contribution: amount * featureWeight(feature) })).filter((item) => item.contribution > 0).sort((left, right) => right.contribution - left.contribution).slice(0, limit);
}

function nearestMarkers(candidate, markers, model) {
  const similarityVector = (entry) => normalizedSequenceVector(entry.sequence, "mature", model.config.kValues, true);
  const vector = similarityVector(candidate);
  return markers.map((marker) => ({ marker: markerDisplayName(marker.name), similarity: cosineSimilarity(vector, similarityVector(marker)) })).sort((left, right) => right.similarity - left.similarity).slice(0, 3);
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function main() {
  for (const requiredPath of [FASTA_PATH, DATASET_CSV, POSITIVE_MARKERS_CSV, TRAINING_POLICY_CSV]) if (!fs.existsSync(requiredPath)) throw new Error(`Arquivo obrigatorio nao encontrado: ${requiredPath}`);
  const dataset = readCsv(DATASET_CSV);
  if (!dataset.indexByName.has("classe")) throw new Error(`Coluna classe ausente em ${DATASET_CSV}`);
  const featuresByFamily = new Map();
  for (const feature of dataset.header.slice(2)) {
    const family = precursorFamilyBase(feature);
    const current = featuresByFamily.get(family) ?? [];
    current.push(feature);
    featuresByFamily.set(family, current);
  }
  const matureEntries = readFasta(FASTA_PATH);
  const byNormalizedName = new Map(matureEntries.map((entry) => [entry.normalizedName, entry]));
  const positiveMarkers = readPositiveMarkers();
  const resolved = positiveMarkers.map((marker) => resolveMarkerEntry(marker, byNormalizedName)).filter(Boolean);
  const markerEntries = resolved.filter((entry) => entry.markerMetadata.use_in_training.toLowerCase() === "sim");
  const knownNames = new Set(resolved.map((entry) => entry.normalizedName));
  const missingMarkers = positiveMarkers.filter((marker) => !resolved.some((entry) => normalizeMarkerName(marker.resolved_mature_mirna || marker.mirna) === entry.normalizedName));
  if (markerEntries.length < 5) throw new Error(`Marcadores positivos insuficientes: ${markerEntries.length}`);
  const candidateEntries = matureEntries.filter((entry) => !knownNames.has(entry.normalizedName)).map((entry) => ({ ...entry, associatedFeatures: featuresByFamily.get(entry.familyBase) ?? [] }));
  const candidatesWithExpressionCount = candidateEntries.filter((entry) => entry.associatedFeatures.length > 0).length;

  console.log(`Iniciando validacao aninhada por ${new Set(markerEntries.map((entry) => seedRegion(entry.sequence))).size} familias de seed...`);
  const nestedValidation = runNestedFamilyValidation(markerEntries, candidateEntries);
  const finalConfig = chooseFinalConfiguration(nestedValidation.fold_selections);
  console.log(`Configuracao final: ${finalConfig.id}`);
  const model = trainPuEnsemble(markerEntries, candidateEntries, finalConfig, { bags: FINAL_PU_BAGS, bagSize: FINAL_BAG_SIZE, epochs: FINAL_EPOCHS, salt: `final-${finalConfig.id}` });
  const stabilityByName = candidateOutOfBagStability(model, candidateEntries);
  const preRanked = candidateEntries.map((candidate) => {
    const outOfBag = outOfBagLogit(model, candidate);
    return { candidate, rawLogit: outOfBag.logit, outOfBagModelCount: outOfBag.modelCount, usedOutOfBagFallback: outOfBag.usedFallback, scoringModels: outOfBag.scoringModels, stability: stabilityByName.get(candidate.normalizedName) };
  });
  const orderedAscending = [...preRanked].sort((left, right) => left.rawLogit - right.rawLogit || left.candidate.normalizedName.localeCompare(right.candidate.normalizedName));
  const percentileByName = new Map(orderedAscending.map((item, index) => [item.candidate.normalizedName, orderedAscending.length === 1 ? 1 : index / (orderedAscending.length - 1)]));
  const ranked = preRanked.map(({ candidate, rawLogit, outOfBagModelCount, usedOutOfBagFallback, scoringModels, stability }) => ({ ...candidate, rawLogit, outOfBagModelCount, usedOutOfBagFallback, stability, probability: sigmoid(rawLogit), sequenceScore: percentileByName.get(candidate.normalizedName) ?? 0, nearest: nearestMarkers(candidate, markerEntries, model), topFeatures: topContributingFeatures(model, candidate, 10, scoringModels) })).sort((left, right) => right.sequenceScore - left.sequenceScore || left.normalizedName.localeCompare(right.normalizedName));

  ensureDirectory(OUTPUT_MODEL);
  ensureDirectory(OUTPUT_RANKING);
  ensureDirectory(OUTPUT_REPORT);
  const sortedWeights = [...model.weights.entries()].sort((left, right) => right[1] - left[1]);
  const primaryValidation = nestedValidation.methods.modelo_pu_maduro;
  const finalPositiveWeights = balancedPositiveWeights(markerEntries);
  const modelArtifact = {
    type: "bagged_positive_unlabeled_mature_sequence_model",
    purpose: "Priorizar miRNAs por padroes globais, posicionais e terminais da sequencia madura, incluindo k-mers, seed e composicao, aprendidos dos marcadores associados ao cancer de mama; nao e classificador clinico.",
    training_design: "Ensemble PU por bagging deterministico. Cada bag usa todos os positivos e uma amostra diferente do universo nao rotulado como contraste temporario; candidatos do conjunto nao rotulado sao ranqueados e explicados apenas pelos modelos out-of-bag.",
    source_fasta: projectPath(FASTA_PATH), source_dataset_for_expression_filter: projectPath(DATASET_CSV), positive_markers_csv: projectPath(POSITIVE_MARKERS_CSV), training_policy_csv: projectPath(TRAINING_POLICY_CSV),
    candidate_pool_definition: "Todos os miRNAs humanos maduros do miRBase, removendo os positivos conhecidos; a validacao usa todo o background elegivel.",
    feature_scope: { active_final_configuration: finalConfig.featureSet, mature_blocks_evaluated: ["k-mers globais", "seed (posicoes 2-8)", "comprimento", "fracao GC", "composicao A/U/C/G", "entropia", "k-mers posicionais", "motivos terminais 5p/3p"], excluded: ["precursor hairpin", "estrutura secundaria", "MFE"], rationale: "todos os blocos avaliados pertencem exclusivamente a sequencia madura" },
    positive_weighting: "peso_de_evidencia dividido pelo numero de positivos da mesma familia de seed e reescalado para preservar o peso total",
    hyperparameter_selection: { method: "nested_group_cross_validation_by_seed_family", outer_folds: OUTER_FOLDS, inner_folds: INNER_FOLDS, candidate_configurations: MODEL_CONFIGS, final_configuration: finalConfig, rule: "maior percentil medio por familia na validacao interna; recall@10% e id usados como desempate" },
    pu_ensemble: { bags: FINAL_PU_BAGS, unlabeled_per_bag: model.bagSize, epochs_per_bag: FINAL_EPOCHS, deterministic: true, candidate_scoring: "media dos logits apenas dos modelos em que o candidato nao foi usado como contraste temporario (out-of-bag)", out_of_bag_models_per_candidate_min: Math.min(...ranked.map((candidate) => candidate.outOfBagModelCount)), out_of_bag_models_per_candidate_max: Math.max(...ranked.map((candidate) => candidate.outOfBagModelCount)), out_of_bag_fallback_count: ranked.filter((candidate) => candidate.usedOutOfBagFallback).length },
    vocabulary_size: model.vocabulary.size, bias: model.bias, weights: Object.fromEntries(sortedWeights),
    top_positive_features: sortedWeights.slice(0, 50).map(([feature, weight]) => ({ feature, weight })),
    top_negative_features: sortedWeights.slice(-50).reverse().map(([feature, weight]) => ({ feature, weight })),
    known_markers_with_sequence: markerEntries.map((entry) => ({ requested_marker: entry.requestedName, marker: markerDisplayName(entry.name), accession: entry.accession, sequence: entry.sequence, seed: seedRegion(entry.sequence), family_base: entry.familyBase, resolution_method: entry.resolutionMethod, evidence_weight: markerEvidenceWeight(entry), family_balanced_weight: finalPositiveWeights.get(entry.normalizedName), metadata: entry.markerMetadata })),
    missing_marker_sequences: missingMarkers,
    candidate_count: ranked.length, candidate_count_global_mirbase: ranked.length, candidate_count_with_expression_available: candidatesWithExpressionCount,
    training_history: model.histories,
    ranking_stability: { method: "percentis por bag apenas quando o candidato esta out-of-bag", bags: FINAL_PU_BAGS, fields: ["median_percentile", "percentile_q25", "percentile_q75", "top_1_frequency", "top_5_frequency", "top_10_frequency", "top_20_frequency"] },
    mature_feature_ablation: nestedValidation.mature_feature_ablation,
    internal_recovery_validation: {
      method: "nested_group_cross_validation_by_seed_family_against_full_unlabeled_background", primary_unit: "seed_family", seed_family_count: primaryValidation.family_metrics.count, marker_count: primaryValidation.marker_metrics.count,
      marker_metrics: primaryValidation.marker_metrics, family_metrics: primaryValidation.family_metrics, bootstrap_95_ci: primaryValidation.bootstrap_95_ci, random_ranking_test: primaryValidation.random_ranking_test,
      baselines: Object.fromEntries(Object.entries(nestedValidation.methods).filter(([name]) => name !== "modelo_pu_maduro").map(([name, value]) => [name, { marker_metrics: value.marker_metrics, family_metrics: value.family_metrics }])),
      fold_selections: nestedValidation.fold_selections, family_details: primaryValidation.family_details, marker_details: primaryValidation.marker_details,
      background_pool: "todo o background elegivel; candidatos com a mesma seed retida sao excluidos apenas daquela comparacao",
      warning: "A validacao e interna e mede generalizacao para familias de seed nao vistas. Nao e validacao clinica nem laboratorial.",
    },
    candidate_ranking_score_definition: "score_modelo_sequencial e o percentil do logit PU out-of-bag no universo de candidatos; cada candidato e pontuado apenas por bags em que nao foi usado como contraste temporario.",
    next_step: "Executar scripts/validate_mirna_candidates_in_patients_model.js para testar os candidatos no dataset de pacientes.",
  };
  fs.writeFileSync(OUTPUT_MODEL, JSON.stringify(modelArtifact, null, 2), "utf8");

  const outputHeader = ["rank", "mirna", "accession", "sequence", "tem_expressao_no_dataset", "score_modelo_sequencial", "probabilidade_pu_consenso_bruta", "probabilidade_contrastiva_bruta", "numero_modelos_oob", "logit_modelo_sequencial", "percentil_mediano_bags_oob", "percentil_q25_bags_oob", "percentil_q75_bags_oob", "iqr_percentil_bags_oob", "frequencia_top_1_bags_oob", "frequencia_top_5_bags_oob", "frequencia_top_10_bags_oob", "frequencia_top_20_bags_oob", "features_expressao_associadas", "features_modelo_mais_influentes", "features_kmer_mais_influentes", "marcadores_referencia_mais_proximos"];
  const outputRows = ranked.map((candidate, index) => {
    const influential = candidate.topFeatures.map((item) => `${item.feature}:${item.contribution.toFixed(4)}`).join("; ");
    return [index + 1, markerDisplayName(candidate.name), candidate.accession, candidate.sequence, candidate.associatedFeatures.length ? "sim" : "nao", candidate.sequenceScore.toFixed(6), candidate.probability.toFixed(6), candidate.probability.toFixed(6), candidate.outOfBagModelCount, candidate.rawLogit.toFixed(6), candidate.stability.median_percentile.toFixed(6), candidate.stability.percentile_q25.toFixed(6), candidate.stability.percentile_q75.toFixed(6), candidate.stability.percentile_iqr.toFixed(6), candidate.stability.top_1_frequency.toFixed(6), candidate.stability.top_5_frequency.toFixed(6), candidate.stability.top_10_frequency.toFixed(6), candidate.stability.top_20_frequency.toFixed(6), candidate.associatedFeatures.join("; "), influential, influential, candidate.nearest.map((item) => `${item.marker}:${item.similarity.toFixed(3)}`).join("; ")];
  });
  fs.writeFileSync(OUTPUT_RANKING, [outputHeader, ...outputRows].map((row) => row.map(csvCell).join(",")).join("\n"), "utf8");

  const markerMetrics = primaryValidation.marker_metrics;
  const familyMetrics = primaryValidation.family_metrics;
  const report = [
    "Modelo 1 - descoberta de candidatos por sequencia madura e ensemble PU", "",
    `FASTA maduro: ${projectPath(FASTA_PATH)}`,
    `Escopo final de features: ${finalConfig.featureSet} da sequencia madura; foram comparados core, composicao, k-mers posicionais, motivos terminais e representacao completa. Hairpin e estrutura secundaria nao participam do modelo.`,
    `Marcadores positivos: ${markerEntries.length}`, `Familias de seed positivas: ${familyMetrics.count}`, `Candidatos ranqueados: ${ranked.length}`, `Candidatos com expressao para o Modelo 2: ${candidatesWithExpressionCount}`, `Configuracao final escolhida: ${finalConfig.id}`, `Ensemble PU final: ${FINAL_PU_BAGS} bags x ${model.bagSize} nao rotulados`, `Pontuacao dos candidatos: out-of-bag (${Math.min(...ranked.map((candidate) => candidate.outOfBagModelCount))} a ${Math.max(...ranked.map((candidate) => candidate.outOfBagModelCount))} modelos por candidato; fallbacks=${ranked.filter((candidate) => candidate.usedOutOfBagFallback).length})`, `Vocabulario final: ${model.vocabulary.size} features`, "",
    "Validacao aninhada por familia de seed (metrica principal por familia):",
    `Percentil medio por familia=${familyMetrics.mean_percentile.toFixed(4)}`,
    `Recall@1% por familia=${percent(familyMetrics.recall_at_1_percent)} (${familyMetrics.recovered_at_1_percent}/${familyMetrics.count})`,
    `Recall@5% por familia=${percent(familyMetrics.recall_at_5_percent)} (${familyMetrics.recovered_at_5_percent}/${familyMetrics.count})`,
    `Recall@10% por familia=${percent(familyMetrics.recall_at_10_percent)} (${familyMetrics.recovered_at_10_percent}/${familyMetrics.count})`,
    `Recall@20% por familia=${percent(familyMetrics.recall_at_20_percent)} (${familyMetrics.recovered_at_20_percent}/${familyMetrics.count})`,
    `IC95% bootstrap do percentil medio=${primaryValidation.bootstrap_95_ci.mean_percentile_95_ci.map((value) => value.toFixed(4)).join(" a ")}`,
    `IC95% bootstrap do Recall@10%=${primaryValidation.bootstrap_95_ci.recall_at_10_percent_95_ci.map(percent).join(" a ")}`,
    `p do nulo de ranking para percentil medio=${primaryValidation.random_ranking_test.p_value_mean_percentile.toFixed(4)}`,
    `p do nulo de ranking para Recall@10%=${primaryValidation.random_ranking_test.p_value_recall_at_10_percent.toFixed(4)}`, "",
    "Metricas secundarias por marcador:", `Percentil medio por marcador=${markerMetrics.mean_percentile.toFixed(4)}`, `Recall@10% por marcador=${percent(markerMetrics.recall_at_10_percent)} (${markerMetrics.recovered_at_10_percent}/${markerMetrics.count})`, "",
    "Comparacao com baselines por familia:",
    ...Object.entries(nestedValidation.methods).map(([name, value]) => `${name}\tpercentil_medio=${value.family_metrics.mean_percentile.toFixed(4)}\trecall@10%=${percent(value.family_metrics.recall_at_10_percent)}`), "",
    "Ablacao pareada de features maduras (mesmos folds e hiperparametros):",
    ...Object.entries(nestedValidation.mature_feature_ablation.representations).map(([name, value]) => `${name}\tpercentil_medio=${value.family_metrics.mean_percentile.toFixed(4)}\trecall@10%=${percent(value.family_metrics.recall_at_10_percent)}`),
    ...Object.entries(nestedValidation.mature_feature_ablation.paired_comparisons_against_core).map(([name, value]) => `${name}_vs_core\tdelta=${value.mean_paired_delta.toFixed(4)}\tIC95%=${value.bootstrap_95_ci.map((item) => item.toFixed(4)).join(" a ")}\tp=${value.paired_sign_flip_p_value_two_sided.toFixed(4)}\tFDR_BH=${value.paired_sign_flip_fdr_bh.toFixed(4)}`), "",
    "Top features positivas do modelo final:", ...sortedWeights.slice(0, 15).map(([feature, weight]) => `${feature}\tpeso=${weight.toFixed(6)}`), "",
    "Top candidatos do ranking final:", ...ranked.slice(0, TOP_REPORT_COUNT).map((candidate, index) => `${index + 1}. ${markerDisplayName(candidate.name)}\tscore=${candidate.sequenceScore.toFixed(4)}\tpu=${candidate.probability.toFixed(4)}\texpressao=${candidate.associatedFeatures.length ? "sim" : "nao"}\treferencias=${candidate.nearest.map((item) => `${item.marker}:${item.similarity.toFixed(3)}`).join(", ")}`), "",
    "Interpretacao:", "O Modelo 1 usa k-mers da sequencia madura como nucleo, alem de seed, composicao, balanceamento por familia e bagging Positive-Unlabeled.", "Hairpin e estrutura secundaria foram excluidos deliberadamente para manter o escopo do TCC no miRNA maduro.", "A metrica principal e calculada nas familias de seed externas, que nao participam nem do treino nem da escolha de hiperparametros.", "O score e uma prioridade relativa para pesquisa, nao probabilidade de cancer, diagnostico ou validacao clinica.", "",
  ].join("\n");
  fs.writeFileSync(OUTPUT_REPORT, report, "utf8");
  console.log(report);
}

main();
