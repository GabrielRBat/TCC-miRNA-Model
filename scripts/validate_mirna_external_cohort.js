const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const INTERNAL_DATASET = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const INTEGRATED_RANKING = fromRoot("data", "processed", "mirna_patient_candidate_integrated_ranking.csv");
const SEQUENCE_MODEL = fromRoot("models", "modelo_mirna_candidate_discovery.json");
const PATIENT_MODEL = fromRoot("models", "modelo_mirna_patient_candidate_validation.json");
const MIN_EXTERNAL_SAMPLES_PER_CLASS = 10;
const PRACTICAL_AUC_THRESHOLD = 0.60;
const P_VALUE_FLOOR = 1e-16;

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else current += character;
    } else if (character === ",") { values.push(current); current = ""; }
    else if (character === '"') quoted = true;
    else current += character;
  }
  values.push(current);
  return values;
}

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error(`CSV vazio: ${filePath}`);
  const header = parseCsvLine(lines[0]).map((item) => item.trim());
  if (new Set(header).size !== header.length) throw new Error(`CSV possui cabecalhos duplicados: ${filePath}`);
  const rows = lines.slice(1).map((line, index) => {
    const row = parseCsvLine(line);
    if (row.length !== header.length) throw new Error(`Linha ${index + 2} possui ${row.length} colunas; esperado: ${header.length}`);
    return row;
  });
  return { header, rows, indexByName: new Map(header.map((name, index) => [name, index])) };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeMirna(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", "-").replace(/^hsa-/, "");
}

function matureFamily(value) {
  const withoutArm = normalizeMirna(value).replace(/-[35]p$/, "");
  const locusMatch = withoutArm.match(/^((?:mir|let)-.+)-\d+$/);
  return locusMatch ? locusMatch[1] : withoutArm;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function hedgesG(positives, negatives) {
  const degrees = positives.length + negatives.length - 2;
  if (degrees <= 0) return 0;
  const pooledVariance = ((positives.length - 1) * sampleVariance(positives) + (negatives.length - 1) * sampleVariance(negatives)) / degrees;
  if (!(pooledVariance > 0)) return 0;
  const cohensD = (mean(positives) - mean(negatives)) / Math.sqrt(pooledVariance);
  const correction = 1 - 3 / Math.max(1, 4 * (positives.length + negatives.length) - 9);
  return cohensD * correction;
}

function meanDifferenceConfidenceInterval(positives, negatives) {
  const difference = mean(positives) - mean(negatives);
  const standardError = Math.sqrt(sampleVariance(positives) / positives.length + sampleVariance(negatives) / negatives.length);
  return [difference - 1.96 * standardError, difference + 1.96 * standardError];
}

function computeAuc(positives, negatives) {
  const scored = [...positives.map((value) => ({ value, label: 1 })), ...negatives.map((value) => ({ value, label: 0 }))].sort((a, b) => a.value - b.value);
  let positiveRankSum = 0;
  for (let index = 0; index < scored.length;) {
    let end = index + 1;
    while (end < scored.length && scored[end].value === scored[index].value) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) if (scored[cursor].label === 1) positiveRankSum += averageRank;
    index = end;
  }
  return (positiveRankSum - positives.length * (positives.length + 1) / 2) / Math.max(1, positives.length * negatives.length);
}

function aucConfidenceInterval(auc, positiveCount, negativeCount) {
  const pairCount = Math.max(1, positiveCount * negativeCount);
  const varianceAuc = auc <= 0 || auc >= 1 ? (auc * pairCount + 0.5) / (pairCount + 1) : auc;
  const q1 = varianceAuc / Math.max(1e-12, 2 - varianceAuc);
  const q2 = 2 * varianceAuc * varianceAuc / Math.max(1e-12, 1 + varianceAuc);
  const variance = (varianceAuc * (1 - varianceAuc) + (positiveCount - 1) * (q1 - varianceAuc ** 2) + (negativeCount - 1) * (q2 - varianceAuc ** 2)) / pairCount;
  const standardError = Math.sqrt(Math.max(0, variance));
  return [Math.max(0, auc - 1.96 * standardError), Math.min(1, auc + 1.96 * standardError)];
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

function aucPValue(auc, positiveCount, negativeCount) {
  const nullStandardError = Math.sqrt((positiveCount + negativeCount + 1) / Math.max(1, 12 * positiveCount * negativeCount));
  const z = nullStandardError > 0 ? (auc - 0.5) / nullStandardError : 0;
  return Math.max(P_VALUE_FLOOR, Math.min(1, 1 - normalCdf(z)));
}

function benjaminiHochberg(items) {
  const ordered = [...items].sort((left, right) => left.pValue - right.pValue);
  let runningMinimum = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const adjusted = Math.min(1, ordered[index].pValue * ordered.length / (index + 1));
    runningMinimum = Math.min(runningMinimum, adjusted);
    ordered[index].fdrBh = runningMinimum;
  }
}

function rankValues(values) {
  const ordered = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const ranks = Array(values.length).fill(0);
  for (let index = 0; index < ordered.length;) {
    let end = index + 1;
    while (end < ordered.length && ordered[end].value === ordered[index].value) end += 1;
    const rank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) ranks[ordered[cursor].index] = rank;
    index = end;
  }
  return ranks;
}

function pearson(left, right) {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  }
  return numerator / Math.max(1e-15, Math.sqrt(leftSquares * rightSquares));
}

function spearman(left, right) {
  return pearson(rankValues(left), rankValues(right));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function parseArguments() {
  const args = process.argv.slice(2);
  if (!args.length || args[0].startsWith("--")) {
    throw new Error("Uso: node scripts/validate_mirna_external_cohort.js coorte.csv --scale log2|linear [--output-stem nome] [--cohort-label rotulo]");
  }
  const options = { input: path.resolve(args[0]), scale: null, sampleCenter: "none", outputStem: "mirna_external_cohort_validation", cohortLabel: "coorte_externa" };
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (["--scale", "--sample-center", "--output-stem", "--cohort-label"].includes(option)) {
      if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${option}`);
      if (option === "--scale") options.scale = value;
      if (option === "--sample-center") options.sampleCenter = value;
      if (option === "--output-stem") options.outputStem = value;
      if (option === "--cohort-label") options.cohortLabel = value;
      index += 1;
    } else throw new Error(`Opcao desconhecida: ${option}`);
  }
  if (!options.scale || !["linear", "log2"].includes(options.scale)) throw new Error("Informe explicitamente --scale linear ou --scale log2");
  if (!["none", "mean"].includes(options.sampleCenter)) throw new Error("--sample-center aceita none ou mean");
  if (!/^[a-z0-9_-]+$/i.test(options.outputStem)) throw new Error("--output-stem aceita apenas letras, numeros, _ e -");
  return options;
}

function readExternalForRanking(filePath, scale, sampleCenter, ranking) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error(`CSV vazio: ${filePath}`);
  const header = parseCsvLine(lines[0]).map((item) => item.trim());
  if (new Set(header).size !== header.length) throw new Error(`CSV possui cabecalhos duplicados: ${filePath}`);
  const indexByName = new Map(header.map((name, index) => [name, index]));
  for (const required of ["sample_id", "classe"]) if (!indexByName.has(required)) throw new Error(`Coluna obrigatoria ausente: ${required}`);

  const expressionEntries = header.map((name, index) => ({ name, index, normalized: normalizeMirna(name) }))
    .filter((entry) => /^(mir|let)-/.test(entry.normalized));
  if (!expressionEntries.length) throw new Error("Nenhuma coluna de miRNA reconhecida na coorte externa");
  const exactHeaders = new Map();
  const familyHeaders = new Map();
  for (const entry of expressionEntries) {
    if (exactHeaders.has(entry.normalized)) throw new Error(`Colunas de expressao duplicadas apos normalizacao: ${exactHeaders.get(entry.normalized).name} e ${entry.name}`);
    exactHeaders.set(entry.normalized, entry);
    const family = matureFamily(entry.normalized);
    const related = familyHeaders.get(family) ?? [];
    related.push(entry);
    familyHeaders.set(family, related);
  }

  const mappings = ranking.rows.map((row) => {
    const get = (name) => row[ranking.indexByName.get(name)] ?? "";
    const mirna = get("mirna");
    const exact = exactHeaders.get(normalizeMirna(mirna));
    const features = exact ? [exact] : (familyHeaders.get(matureFamily(mirna)) ?? []);
    return { row, get, mirna, features, resolution: exact ? "miRNA_maduro_exato" : features.length ? "proxy_familia_precursor" : "ausente" };
  });
  const selectedEntries = [...new Map(mappings.flatMap((mapping) => mapping.features).map((entry) => [entry.index, entry])).values()].sort((a, b) => a.index - b.index);
  const featureValues = new Map(selectedEntries.map((entry) => [entry.name, []]));
  const sampleIds = [];
  const labels = [];
  let minimum = Infinity;
  let maximum = -Infinity;
  let negativeCount = 0;
  let numericCount = 0;

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = parseCsvLine(lines[lineIndex]);
    if (cells.length !== header.length) throw new Error(`Linha ${lineIndex + 1} possui ${cells.length} colunas; esperado: ${header.length}`);
    const sampleId = cells[indexByName.get("sample_id")]?.trim();
    const label = Number(cells[indexByName.get("classe")]);
    if (!sampleId) throw new Error(`sample_id vazio na linha ${lineIndex + 1}`);
    if (![0, 1].includes(label)) throw new Error(`classe invalida em sample_id=${sampleId}`);
    sampleIds.push(sampleId);
    labels.push(label);
    let rowSum = 0;
    for (const entry of expressionEntries) {
      const raw = cells[entry.index];
      const value = Number(raw);
      if (String(raw ?? "").trim() === "" || !Number.isFinite(value)) throw new Error(`Expressao invalida em sample_id=${sampleId}, feature=${entry.name}: ${raw}`);
      if (scale === "linear" && value < 0) throw new Error(`Expressao negativa incompativel com --scale linear em sample_id=${sampleId}, feature=${entry.name}: ${raw}`);
      if (value < 0) negativeCount += 1;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      numericCount += 1;
      rowSum += value;
    }
    const center = sampleCenter === "mean" ? rowSum / expressionEntries.length : 0;
    for (const entry of selectedEntries) featureValues.get(entry.name).push(Number(cells[entry.index]) - center);
  }
  if (new Set(sampleIds.map((value) => value.toLowerCase())).size !== sampleIds.length) throw new Error("A coorte externa possui sample_id duplicado");
  if (!labels.includes(0) || !labels.includes(1)) throw new Error("A coluna classe deve conter 0 e 1");
  return { mappings, featureValues, sampleIds, labels, expressionCount: expressionEntries.length, numericCount, negativeCount, minimum, maximum };
}

function main() {
  const options = parseArguments();
  for (const required of [options.input, INTERNAL_DATASET, INTEGRATED_RANKING, SEQUENCE_MODEL, PATIENT_MODEL]) {
    if (!fs.existsSync(required)) throw new Error(`Arquivo nao encontrado: ${required}`);
  }
  const internal = readCsv(INTERNAL_DATASET);
  const ranking = readCsv(INTEGRATED_RANKING);
  const external = readExternalForRanking(options.input, options.scale, options.sampleCenter, ranking);
  const diseaseCount = external.labels.filter((value) => value === 1).length;
  const controlCount = external.labels.filter((value) => value === 0).length;
  if (diseaseCount < 2 || controlCount < 2) throw new Error("A coorte externa precisa de pelo menos duas amostras por classe");
  const minimumSampleSizeMet = diseaseCount >= MIN_EXTERNAL_SAMPLES_PER_CLASS && controlCount >= MIN_EXTERNAL_SAMPLES_PER_CLASS;

  const internalSampleIdIndex = internal.indexByName.get("sample_id");
  if (internalSampleIdIndex === undefined) throw new Error("A base interna nao possui sample_id para conferir independencia");
  const internalIds = new Set(internal.rows.map((row) => String(row[internalSampleIdIndex] ?? "").trim().toLowerCase()).filter(Boolean));
  const overlappingIds = external.sampleIds.filter((id) => internalIds.has(id.toLowerCase()));
  if (overlappingIds.length) throw new Error(`Coorte nao independente: ${overlappingIds.length} sample_id tambem aparecem na base interna`);

  const results = [];
  for (const mapping of external.mappings.filter((item) => item.features.length)) {
    const values = external.sampleIds.map((unused, sampleIndex) => mean(mapping.features.map((feature) => external.featureValues.get(feature.name)[sampleIndex])));
    const analysisValues = options.scale === "log2" ? values : values.map((value) => Math.log1p(value));
    const disease = analysisValues.filter((value, index) => external.labels[index] === 1);
    const controls = analysisValues.filter((value, index) => external.labels[index] === 0);
    const diseaseRaw = values.filter((value, index) => external.labels[index] === 1);
    const controlRaw = values.filter((value, index) => external.labels[index] === 0);
    const rawAuc = computeAuc(disease, controls);
    const expectedHigher = mapping.get("direcao_aprendida_no_paciente") !== "menor_expressao_puxa_para_doente";
    const directionalAuc = expectedHigher ? rawAuc : 1 - rawAuc;
    const difference = mean(disease) - mean(controls);
    const differenceInterval = meanDifferenceConfidenceInterval(disease, controls);
    const directionConcordant = expectedHigher ? difference > 0 : difference < 0;
    const confidenceInterval = aucConfidenceInterval(directionalAuc, disease.length, controls.length);
    const pValue = aucPValue(directionalAuc, disease.length, controls.length);
    const rawHedgesG = hedgesG(disease, controls);
    const rawCliffsDelta = 2 * rawAuc - 1;
    results.push({
      mirna: mapping.mirna,
      internalRank: Number(mapping.get("rank_integrado")),
      internalScore: Number(mapping.get("score_final_descoberta")),
      internalArmAmbiguity: mapping.get("ambiguidade_braco_maduro") === "sim",
      features: mapping.features.map((feature) => feature.name),
      resolution: mapping.resolution,
      expectedDirection: mapping.get("direcao_aprendida_no_paciente"),
      directionConcordant,
      directionalAuc,
      confidenceInterval,
      pValue,
      rawAuc,
      rawCliffsDelta,
      directionalCliffsDelta: expectedHigher ? rawCliffsDelta : -rawCliffsDelta,
      rawHedgesG,
      directionalHedgesG: expectedHigher ? rawHedgesG : -rawHedgesG,
      difference,
      differenceInterval,
      log2FoldChange: options.scale === "log2" ? mean(diseaseRaw) - mean(controlRaw) : Math.log2((mean(diseaseRaw) + 1) / (mean(controlRaw) + 1)),
      diseaseMean: mean(diseaseRaw),
      controlMean: mean(controlRaw),
      diseaseMedian: median(diseaseRaw),
      controlMedian: median(controlRaw),
    });
  }

  const hypothesesByKey = new Map();
  for (const item of results) {
    item.hypothesisKey = `${[...item.features].sort().join("|")}|${item.expectedDirection}`;
    if (!hypothesesByKey.has(item.hypothesisKey)) hypothesesByKey.set(item.hypothesisKey, { key: item.hypothesisKey, pValue: item.pValue, fdrBh: 1 });
  }
  benjaminiHochberg([...hypothesesByKey.values()]);
  for (const item of results) {
    item.fdrBh = hypothesesByKey.get(item.hypothesisKey).fdrBh;
    item.replicatedSignal = minimumSampleSizeMet && item.directionConcordant && item.confidenceInterval[0] > 0.5 && item.fdrBh < 0.05;
    item.replicatedExact = item.replicatedSignal && item.resolution === "miRNA_maduro_exato";
    item.replicatedExactUnambiguous = item.replicatedExact && !item.internalArmAmbiguity;
    item.practicalSignal = item.replicatedSignal && item.directionalAuc >= PRACTICAL_AUC_THRESHOLD;
    item.practicalExact = item.practicalSignal && item.resolution === "miRNA_maduro_exato";
  }

  const exactResults = results.filter((item) => item.resolution === "miRNA_maduro_exato");
  const spearmanExact = spearman(exactResults.map((item) => item.internalScore), exactResults.map((item) => item.directionalAuc));
  const topK = [10, 20, 50, 100].map((limit) => {
    const eligible = exactResults.filter((item) => item.internalRank <= limit);
    return {
      limit,
      exactCandidatesFound: eligible.length,
      statisticallyReplicated: eligible.filter((item) => item.replicatedExact).length,
      practicalAucAtLeast060: eligible.filter((item) => item.practicalExact).length,
    };
  });

  results.sort((left, right) => Number(right.practicalExact) - Number(left.practicalExact)
    || Number(right.replicatedExact) - Number(left.replicatedExact)
    || Number(right.replicatedSignal) - Number(left.replicatedSignal)
    || right.directionalAuc - left.directionalAuc
    || left.internalRank - right.internalRank);

  const outputCsv = fromRoot("data", "processed", `${options.outputStem}.csv`);
  const outputReport = fromRoot("reports", `${options.outputStem}_report.txt`);
  const outputSummary = fromRoot("reports", `${options.outputStem}_summary.json`);
  const outputHeader = ["rank_externo", "mirna", "rank_integrado_interno", "score_integrado_interno", "features_externas", "resolucao_mapeamento", "ambiguidade_interna_braco", "direcao_interna_esperada", "direcao_concordante", "auc_externa_direcional", "auc_externa_ic95_inferior", "auc_externa_ic95_superior", "auc_externa_p_gt_0_5_unilateral_aprox", "auc_externa_fdr_bh_aprox", "auc_externa_bruta", "cliffs_delta_direcional", "hedges_g_direcional", "diferenca_media_escala_analise", "diferenca_media_ic95_inferior", "diferenca_media_ic95_superior", "log2_fc_externo", "media_cancer_externa", "media_controle_externa", "mediana_cancer_externa", "mediana_controle_externa", "escala_entrada", "sinal_reproduzido_com_fdr", "replicacao_madura_exata", "replicacao_madura_sem_ambiguidade_interna", "replicacao_magnitude_auc_0_60"];
  const outputRows = results.map((item, index) => [index + 1, item.mirna, item.internalRank, item.internalScore.toFixed(6), item.features.join("; "), item.resolution, item.internalArmAmbiguity ? "sim" : "nao", item.expectedDirection, item.directionConcordant ? "sim" : "nao", item.directionalAuc.toFixed(6), item.confidenceInterval[0].toFixed(6), item.confidenceInterval[1].toFixed(6), item.pValue.toExponential(6), item.fdrBh.toExponential(6), item.rawAuc.toFixed(6), item.directionalCliffsDelta.toFixed(6), item.directionalHedgesG.toFixed(6), item.difference.toFixed(6), item.differenceInterval[0].toFixed(6), item.differenceInterval[1].toFixed(6), item.log2FoldChange.toFixed(6), item.diseaseMean.toFixed(6), item.controlMean.toFixed(6), item.diseaseMedian.toFixed(6), item.controlMedian.toFixed(6), options.scale, item.replicatedSignal ? "sim" : "nao", item.replicatedExact ? "sim" : "nao", item.replicatedExactUnambiguous ? "sim" : "nao", item.practicalSignal ? "sim" : "nao"]);
  fs.mkdirSync(path.dirname(outputCsv), { recursive: true });
  fs.mkdirSync(path.dirname(outputReport), { recursive: true });
  fs.writeFileSync(outputCsv, [outputHeader, ...outputRows].map((row) => row.map(csvCell).join(",")).join("\n"), "utf8");

  const summary = {
    schemaVersion: 1,
    cohort: options.cohortLabel,
    input: path.relative(ROOT, options.input).split(path.sep).join("/"),
    inputScale: options.scale,
    analysisTransformation: `${options.scale === "log2" ? "valores log2 usados diretamente" : "log1p para AUC e tamanhos de efeito"}; centralizacao por media da amostra=${options.sampleCenter}`,
    sampleCenter: options.sampleCenter,
    frozenCommit: "fab7197625a1841c56ca54d7fc038f37cb1491c3",
    provenanceSha256: {
      inputCsv: sha256File(options.input),
      integratedRanking: sha256File(INTEGRATED_RANKING),
      sequenceModel: sha256File(SEQUENCE_MODEL),
      patientModel: sha256File(PATIENT_MODEL),
    },
    samples: { total: external.sampleIds.length, breastCancer: diseaseCount, nonCancerControls: controlCount, overlapWithInternalIds: overlappingIds.length },
    inputAudit: { mirnaColumns: external.expressionCount, numericValues: external.numericCount, negativeValuesAllowedOnLog2Scale: external.negativeCount, minimum: external.minimum, maximum: external.maximum },
    coverage: {
      frozenCandidates: external.mappings.length,
      matureExact: external.mappings.filter((item) => item.resolution === "miRNA_maduro_exato").length,
      familyProxy: external.mappings.filter((item) => item.resolution === "proxy_familia_precursor").length,
      absent: external.mappings.filter((item) => item.resolution === "ausente").length,
      distinctExternalHypotheses: hypothesesByKey.size,
    },
    replication: {
      directionConcordant: results.filter((item) => item.directionConcordant).length,
      statisticallyReplicatedAllMappings: results.filter((item) => item.replicatedSignal).length,
      statisticallyReplicatedMatureExact: results.filter((item) => item.replicatedExact).length,
      statisticallyReplicatedMatureExactWithoutInternalArmAmbiguity: results.filter((item) => item.replicatedExactUnambiguous).length,
      practicalAucAtLeast060AllMappings: results.filter((item) => item.practicalSignal).length,
      practicalAucAtLeast060MatureExact: results.filter((item) => item.practicalExact).length,
    },
    rankingEvaluation: { spearmanInternalScoreVsExternalDirectionalAucMatureExact: spearmanExact, topK },
    criteria: { minimumSamplesPerClass: MIN_EXTERNAL_SAMPLES_PER_CLASS, directionalAucCiLowerGreaterThan: 0.5, fdrBhLessThan: 0.05, practicalDirectionalAucAtLeast: PRACTICAL_AUC_THRESHOLD },
    outputs: { csv: path.relative(ROOT, outputCsv).split(path.sep).join("/"), report: path.relative(ROOT, outputReport).split(path.sep).join("/"), summary: path.relative(ROOT, outputSummary).split(path.sep).join("/") },
  };
  fs.writeFileSync(outputSummary, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const topLines = results.slice(0, 30).map((item, index) => `${index + 1}. ${item.mirna}\tauc=${item.directionalAuc.toFixed(3)}\tIC95%=${item.confidenceInterval.map((value) => value.toFixed(3)).join(" a ")}\tFDR=${item.fdrBh.toExponential(2)}\tg_dir=${item.directionalHedgesG.toFixed(3)}\tconcordante=${item.directionConcordant ? "sim" : "nao"}\tresolucao=${item.resolution}`);
  const report = [
    `Validacao externa predefinida - ${options.cohortLabel}`, "",
    `Entrada: ${summary.input}`,
    `Escala declarada: ${options.scale}`,
    `Centralizacao por amostra: ${options.sampleCenter}`,
    `Transformacao analitica: ${summary.analysisTransformation}`,
    `Amostras: ${external.sampleIds.length} (cancer=${diseaseCount}; controles sem cancer=${controlCount})`,
    `Sobreposicao de sample_id com a coorte interna: ${overlappingIds.length}`,
    `Colunas de miRNA auditadas: ${external.expressionCount}`,
    `Valores numericos auditados: ${external.numericCount}; negativos legitimos em log2: ${external.negativeCount}; faixa=${external.minimum} a ${external.maximum}`, "",
    `Candidatos congelados: ${external.mappings.length}`,
    `Mapeamento maduro exato: ${summary.coverage.matureExact}`,
    `Mapeamento por proxy de familia: ${summary.coverage.familyProxy}`,
    `Ausentes: ${summary.coverage.absent}`,
    `Hipoteses externas distintas submetidas a FDR BH: ${hypothesesByKey.size}`,
    `Direcao concordante: ${summary.replication.directionConcordant}`,
    `Sinais reproduzidos em todos os mapeamentos: ${summary.replication.statisticallyReplicatedAllMappings}`,
    `Replicacoes maduras exatas: ${summary.replication.statisticallyReplicatedMatureExact}`,
    `Replicacoes maduras exatas sem ambiguidade interna de braco: ${summary.replication.statisticallyReplicatedMatureExactWithoutInternalArmAmbiguity}`,
    `Replicacoes com AUC direcional >= ${PRACTICAL_AUC_THRESHOLD.toFixed(2)}: ${summary.replication.practicalAucAtLeast060AllMappings} (maduras exatas=${summary.replication.practicalAucAtLeast060MatureExact})`,
    `Spearman descritivo entre score integrado interno e AUC externa (mapeamentos exatos): ${spearmanExact.toFixed(4)}`, "",
    "Reproducao por faixa do ranking congelado (somente mapeamento maduro exato):",
    ...topK.map((item) => `Top ${item.limit}: encontrados=${item.exactCandidatesFound}; reproduzidos=${item.statisticallyReplicated}; AUC>=0.60=${item.practicalAucAtLeast060}`), "",
    "Top resultados externos:", ...topLines, "",
    "Interpretacao obrigatoria:",
    "O script nao retreina, nao muda o ranking e nao escolhe direcoes usando a coorte externa.",
    "Correspondencia madura exata e primaria; proxy de familia e resultado secundario.",
    `Reproducao estatistica exige direcao concordante, limite inferior do IC95% da AUC > 0.5 e FDR BH < 0.05. A faixa AUC >= ${PRACTICAL_AUC_THRESHOLD.toFixed(2)} e um filtro descritivo de magnitude, nao um limiar clinico.`,
    "IC e p sao aproximacoes assintoticas; valores no piso devem ser apresentados como p<1e-16.",
    "A GSE73002 compartilha a origem bibliografica de cinco marcadores positivos do Modelo 1; isso deve permanecer declarado como dependencia indireta.",
    "Replicacao computacional externa fortalece a evidencia, mas nao substitui validacao laboratorial ou clinica.", "",
  ].join("\n");
  fs.writeFileSync(outputReport, report, "utf8");
  console.log(report);
}

main();
