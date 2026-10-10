const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const projectPath = (filePath) => path.relative(ROOT, filePath).split(path.sep).join("/");

const DATASET_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const CANDIDATE_RANKING_CSV = fromRoot("data", "processed", "mirna_candidate_discovery_model_ranking.csv");
const SEQUENCE_MODEL_JSON = fromRoot("models", "modelo_mirna_candidate_discovery.json");

const OUTPUT_MODEL = fromRoot("models", "modelo_mirna_patient_candidate_validation.json");
const OUTPUT_CSV = fromRoot("data", "processed", "mirna_patient_candidate_validation.csv");
const OUTPUT_INTEGRATED_CSV = fromRoot("data", "processed", "mirna_patient_candidate_integrated_ranking.csv");
const OUTPUT_REPORT = fromRoot("reports", "modelo_mirna_patient_candidate_validation_report.txt");

const TRAIN_MAX_ITERATIONS = 50;
const CONVERGENCE_TOLERANCE = 1e-8;
const L2 = 0.01;
const CV_FOLDS = 5;
const TOP_REPORT_COUNT = 30;
const P_VALUE_FLOOR = 1e-16;

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
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error(`CSV vazio: ${filePath}`);
  const header = parseCsvLine(lines[0]).map((name) => name.trim());
  if (new Set(header).size !== header.length) throw new Error(`CSV possui cabecalhos duplicados: ${filePath}`);
  const rows = lines.slice(1).map((line, index) => {
    const row = parseCsvLine(line);
    if (row.length !== header.length) throw new Error(`Linha ${index + 2} de ${filePath} possui ${row.length} colunas; esperado: ${header.length}`);
    return row;
  });
  return {
    header,
    rows,
    indexByName: new Map(header.map((name, index) => [name, index])),
  };
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

function sigmoid(value) {
  if (value < -35) return 0;
  if (value > 35) return 1;
  return 1 / (1 + Math.exp(-value));
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

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

function aucInference(auc, positiveCount, negativeCount) {
  const pairCount = Math.max(1, positiveCount * negativeCount);
  const varianceAuc = auc <= 0 || auc >= 1 ? (auc * pairCount + 0.5) / (pairCount + 1) : auc;
  const q1 = varianceAuc / Math.max(1e-12, 2 - varianceAuc);
  const q2 = (2 * varianceAuc * varianceAuc) / Math.max(1e-12, 1 + varianceAuc);
  const variance = (
    varianceAuc * (1 - varianceAuc) +
    (positiveCount - 1) * (q1 - varianceAuc * varianceAuc) +
    (negativeCount - 1) * (q2 - varianceAuc * varianceAuc)
  ) / Math.max(1, positiveCount * negativeCount);
  const standardError = Math.sqrt(Math.max(0, variance));
  const nullStandardError = Math.sqrt((positiveCount + negativeCount + 1) / Math.max(1, 12 * positiveCount * negativeCount));
  const z = nullStandardError > 0 ? (auc - 0.5) / nullStandardError : 0;
  const pValue = Math.max(P_VALUE_FLOOR, Math.min(1, 1 - normalCdf(z)));
  return {
    method: "hanley_mcneil_ci_with_half_pair_boundary_stabilization_and_one_sided_null_rank_variance_p_value_auc_gt_0_5_on_oof_predictions",
    standard_error: standardError,
    confidence_interval_95: [Math.max(0, auc - 1.96 * standardError), Math.min(1, auc + 1.96 * standardError)],
    p_value_auc_gt_0_5_one_sided: pValue,
  };
}

function benjaminiHochberg(items, pValueGetter, assign) {
  const ordered = [...items].sort((left, right) => pValueGetter(left) - pValueGetter(right));
  let runningMinimum = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const adjusted = Math.min(1, pValueGetter(ordered[index]) * ordered.length / (index + 1));
    runningMinimum = Math.min(runningMinimum, adjusted);
    assign(ordered[index], runningMinimum);
  }
}

function standardizedMeanDifference(diseaseValues, healthyValues) {
  const diseaseVariance = std(diseaseValues) ** 2;
  const healthyVariance = std(healthyValues) ** 2;
  const degrees = diseaseValues.length + healthyValues.length - 2;
  const pooled = Math.sqrt(Math.max(0, ((diseaseValues.length - 1) * diseaseVariance + (healthyValues.length - 1) * healthyVariance) / Math.max(1, degrees)));
  if (!pooled) return 0;
  const correction = 1 - 3 / Math.max(4, 4 * (diseaseValues.length + healthyValues.length) - 9);
  return correction * (mean(diseaseValues) - mean(healthyValues)) / pooled;
}

function meanDifferenceInference(diseaseValues, healthyValues) {
  const difference = mean(diseaseValues) - mean(healthyValues);
  const standardError = Math.sqrt((std(diseaseValues) ** 2) / Math.max(1, diseaseValues.length) + (std(healthyValues) ** 2) / Math.max(1, healthyValues.length));
  return {
    difference,
    standard_error: standardError,
    confidence_interval_95: [difference - 1.96 * standardError, difference + 1.96 * standardError],
  };
}

function metricsFromPredictions(items) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const item of items) {
    const predicted = item.probability >= 0.5 ? 1 : 0;
    if (predicted === 1 && item.label === 1) tp += 1;
    else if (predicted === 0 && item.label === 0) tn += 1;
    else if (predicted === 1 && item.label === 0) fp += 1;
    else if (predicted === 0 && item.label === 1) fn += 1;
  }

  const positives = items.filter((item) => item.label === 1).map((item) => item.probability);
  const negatives = items.filter((item) => item.label === 0).map((item) => item.probability);
  return {
    accuracy: (tp + tn) / Math.max(1, tp + tn + fp + fn),
    precision: tp / Math.max(1, tp + fp),
    recall: tp / Math.max(1, tp + fn),
    specificity: tn / Math.max(1, tn + fp),
    f1: (2 * tp) / Math.max(1, 2 * tp + fp + fn),
    auc: computeAuc(positives, negatives),
    tp,
    tn,
    fp,
    fn,
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stratifiedFolds(samples, foldCount = CV_FOLDS) {
  const byLabel = new Map();
  for (const sample of samples) {
    const current = byLabel.get(sample.label) ?? [];
    current.push(sample);
    byLabel.set(sample.label, current);
  }

  const folds = Array.from({ length: foldCount }, () => []);
  for (const group of byLabel.values()) {
    const deterministicOrder = [...group].sort(
      (a, b) => stableHash(a.sampleId) - stableHash(b.sampleId) || a.sampleId.localeCompare(b.sampleId)
    );
    deterministicOrder.forEach((sample, index) => {
      folds[index % foldCount].push(sample);
    });
  }
  return folds;
}

function trainUnivariateLogistic(trainSamples) {
  const trainValues = trainSamples.map((sample) => sample.value);
  const center = mean(trainValues);
  const scale = std(trainValues) || 1;
  let weight = 0;
  let bias = 0;
  const history = [];
  const regularization = L2 * Math.max(1, trainSamples.length);

  for (let iteration = 0; iteration < TRAIN_MAX_ITERATIONS; iteration += 1) {
    let gradWeight = 0;
    let gradBias = 0;
    let hessianWeight = regularization;
    let hessianBias = 0;
    let hessianCross = 0;
    let loss = 0;
    for (const sample of trainSamples) {
      const x = (sample.value - center) / scale;
      const probability = sigmoid(weight * x + bias);
      const clipped = Math.min(1 - 1e-9, Math.max(1e-9, probability));
      loss += -(sample.label * Math.log(clipped) + (1 - sample.label) * Math.log(1 - clipped));
      const error = probability - sample.label;
      gradWeight += error * x;
      gradBias += error;
      const curvature = probability * (1 - probability);
      hessianWeight += curvature * x * x;
      hessianBias += curvature;
      hessianCross += curvature * x;
    }

    gradWeight += regularization * weight;
    loss += 0.5 * regularization * weight * weight;
    const determinant = hessianWeight * hessianBias - hessianCross * hessianCross;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) break;

    const deltaWeight = (hessianBias * gradWeight - hessianCross * gradBias) / determinant;
    const deltaBias = (hessianWeight * gradBias - hessianCross * gradWeight) / determinant;
    weight -= deltaWeight;
    bias -= deltaBias;

    history.push({ iteration: iteration + 1, log_loss: loss / Math.max(1, trainSamples.length) });
    if (Math.max(Math.abs(deltaWeight), Math.abs(deltaBias)) < CONVERGENCE_TOLERANCE) break;
  }

  return { weight, bias, center, scale, history };
}

function predict(model, value) {
  const x = (value - model.center) / model.scale;
  return sigmoid(model.weight * x + model.bias);
}

function crossValidateUnivariate(samples, foldCount = CV_FOLDS) {
  const folds = stratifiedFolds(samples, foldCount);
  for (let index = 0; index < folds.length; index += 1) {
    const labels = new Set(folds[index].map((sample) => sample.label));
    if (labels.size !== 2) throw new Error(`Fold ${index + 1} nao contem as duas classes`);
  }
  const outOfFoldPredictions = [];
  const foldMetrics = [];

  for (let foldIndex = 0; foldIndex < folds.length; foldIndex += 1) {
    const test = folds[foldIndex];
    const train = folds.flatMap((fold, index) => (index === foldIndex ? [] : fold));
    const foldModel = trainUnivariateLogistic(train);
    const predictions = test.map((sample) => ({
      ...sample,
      probability: predict(foldModel, sample.value),
    }));
    outOfFoldPredictions.push(...predictions);
    foldMetrics.push({
      fold: foldIndex + 1,
      train_size: train.length,
      validation_size: test.length,
      metrics: metricsFromPredictions(predictions),
    });
  }

  return {
    metrics: metricsFromPredictions(outOfFoldPredictions),
    foldMetrics,
    predictionCount: outOfFoldPredictions.length,
  };
}

function expressionValueForRow(row, dataset, features, sampleId) {
  return features.reduce((sum, feature) => {
    const raw = row[dataset.indexByName.get(feature)];
    const value = Number(raw);
    if (String(raw ?? "").trim() === "" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Expressao invalida em sample_id=${sampleId}, feature=${feature}: ${raw}`);
    }
    return sum + value;
  }, 0) / Math.max(1, features.length);
}

function validationEvidenceScore(item) {
  const aucSignal = Math.max(0, (item.cvMetrics.auc - 0.5) * 2);
  const foldSignal = Math.min(1, Math.abs(item.log2FoldChange) / 3);
  const detectionSignal = Math.min(1, Math.abs(item.diseaseNonzeroPct - item.healthyNonzeroPct) / 50);
  return 0.7 * aucSignal + 0.2 * foldSignal + 0.1 * detectionSignal;
}

function directionFromWeight(weight) {
  if (weight > 0) return "maior_expressao_puxa_para_doente";
  if (weight < 0) return "menor_expressao_puxa_para_doente";
  return "sem_direcao_aprendida";
}

function main() {
  for (const requiredPath of [DATASET_CSV, CANDIDATE_RANKING_CSV, SEQUENCE_MODEL_JSON]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`Arquivo obrigatorio nao encontrado: ${requiredPath}`);
  }

  const dataset = readCsv(DATASET_CSV);
  const candidates = readCsv(CANDIDATE_RANKING_CSV);
  const sequenceModel = JSON.parse(fs.readFileSync(SEQUENCE_MODEL_JSON, "utf8"));
  for (const column of [
    "rank",
    "mirna",
    "score_modelo_sequencial",
    "features_expressao_associadas",
    "marcadores_referencia_mais_proximos",
  ]) {
    if (!candidates.indexByName.has(column)) {
      throw new Error(`Coluna obrigatoria ausente em ${CANDIDATE_RANKING_CSV}: ${column}`);
    }
  }
  if (!candidates.indexByName.has("features_modelo_mais_influentes") && !candidates.indexByName.has("features_kmer_mais_influentes")) {
    throw new Error(`Coluna de features influentes ausente em ${CANDIDATE_RANKING_CSV}`);
  }
  const classIndex = dataset.indexByName.get("classe");
  const sampleIdIndex = dataset.indexByName.get("sample_id");
  if (typeof classIndex !== "number") throw new Error(`Coluna classe ausente em ${DATASET_CSV}`);
  if (typeof sampleIdIndex !== "number") throw new Error(`Coluna sample_id ausente em ${DATASET_CSV}`);

  const sampleIds = dataset.rows.map((row) => row[sampleIdIndex]?.trim());
  if (sampleIds.some((sampleId) => !sampleId)) throw new Error(`sample_id vazio em ${DATASET_CSV}`);
  if (new Set(sampleIds).size !== sampleIds.length) throw new Error(`sample_id duplicado em ${DATASET_CSV}`);
  const labelValues = dataset.rows.map((row) => String(row[classIndex] ?? "").trim() === "" ? NaN : Number(row[classIndex]));
  const labels = new Set(labelValues);
  if (labelValues.some((value) => ![0, 1].includes(value)) || labels.size !== 2 || !labels.has(0) || !labels.has(1)) {
    throw new Error(`Classes esperadas 0 e 1 nao encontradas em ${DATASET_CSV}`);
  }

  const datasetSamples = dataset.rows.map((row, index) => ({
    sampleId: row[sampleIdIndex],
    label: labelValues[index],
    row,
  }));

  const candidateResults = [];
  const candidateModels = [];
  let skippedWithoutExpression = 0;

  for (const row of candidates.rows) {
    const get = (name) => row[candidates.indexByName.get(name)] ?? "";
    const mirna = get("mirna");
    const features = get("features_expressao_associadas")
      .split(";")
      .map((item) => item.trim())
      .filter((feature) => dataset.indexByName.has(feature));
    if (!features.length) {
      skippedWithoutExpression += 1;
      continue;
    }

    const samples = datasetSamples.map((sample, index) => {
      const rawValue = expressionValueForRow(sample.row, dataset, features, sample.sampleId);
      return { index, sampleId: sample.sampleId, label: sample.label, value: Math.log1p(rawValue), rawValue };
    });

    const crossValidation = crossValidateUnivariate(samples);
    const finalModel = trainUnivariateLogistic(samples);
    const cvMetrics = crossValidation.metrics;

    const diseaseRaw = samples.filter((sample) => sample.label === 1).map((sample) => sample.rawValue);
    const healthyRaw = samples.filter((sample) => sample.label === 0).map((sample) => sample.rawValue);
    const diseaseLog = samples.filter((sample) => sample.label === 1).map((sample) => sample.value);
    const healthyLog = samples.filter((sample) => sample.label === 0).map((sample) => sample.value);
    const diseaseMean = mean(diseaseRaw);
    const healthyMean = mean(healthyRaw);
    const log2FoldChange = Math.log2((diseaseMean + 1) / (healthyMean + 1));
    const diseaseNonzeroPct = (diseaseRaw.filter((value) => value > 0).length / Math.max(1, diseaseRaw.length)) * 100;
    const healthyNonzeroPct = (healthyRaw.filter((value) => value > 0).length / Math.max(1, healthyRaw.length)) * 100;

    const result = {
      mirna,
      sequenceRank: Number(get("rank")) || 0,
      sequenceScore: Number(get("score_modelo_sequencial")) || 0,
      features,
      model: finalModel,
      cvMetrics,
      foldMetrics: crossValidation.foldMetrics,
      diseaseMean,
      healthyMean,
      diseaseMedian: median(diseaseRaw),
      healthyMedian: median(healthyRaw),
      log2FoldChange,
      aucInference: aucInference(cvMetrics.auc, diseaseRaw.length, healthyRaw.length),
      rawExpressionAuc: computeAuc(diseaseLog, healthyLog),
      cliffsDelta: 2 * computeAuc(diseaseLog, healthyLog) - 1,
      hedgesGLogExpression: standardizedMeanDifference(diseaseLog, healthyLog),
      logExpressionDifference: meanDifferenceInference(diseaseLog, healthyLog),
      diseaseNonzeroPct,
      healthyNonzeroPct,
      direction: directionFromWeight(finalModel.weight),
      nearestMarkers: get("marcadores_referencia_mais_proximos"),
      influentialKmers: get("features_modelo_mais_influentes") || get("features_kmer_mais_influentes"),
    };
    result.validationScore = validationEvidenceScore(result);
    result.finalDiscoveryScore = 0.5 * result.sequenceScore + 0.5 * result.validationScore;
    candidateResults.push(result);
    candidateModels.push({
      mirna,
      sequence_rank: result.sequenceRank,
      sequence_score: result.sequenceScore,
      features,
      model: {
        type: "univariate_logistic_expression_validation",
        training_scope: "modelo_final_ajustado_em_todas_as_amostras_apos_validacao_cruzada",
        weight: finalModel.weight,
        bias: finalModel.bias,
        center_log1p: finalModel.center,
        scale_log1p: finalModel.scale,
        direction: result.direction,
      },
      cross_validation: {
        method: "stratified_5_fold_out_of_fold",
        folds: CV_FOLDS,
        out_of_fold_metrics: cvMetrics,
        fold_metrics: crossValidation.foldMetrics,
      },
      validation_score: result.validationScore,
      final_discovery_score: result.finalDiscoveryScore,
    });
  }

  const featureGroupCounts = new Map();
  const expressionHypotheses = new Map();
  for (const item of candidateResults) {
    const key = [...item.features].sort().join("|");
    featureGroupCounts.set(key, (featureGroupCounts.get(key) ?? 0) + 1);
    item.expressionHypothesisKey = key;
    if (!expressionHypotheses.has(key)) expressionHypotheses.set(key, { key, pValue: item.aucInference.p_value_auc_gt_0_5_one_sided, fdrBh: 1 });
  }
  benjaminiHochberg([...expressionHypotheses.values()], (item) => item.pValue, (item, adjusted) => { item.fdrBh = adjusted; });
  for (const item of candidateResults) {
    const key = item.expressionHypothesisKey;
    item.aucFdrBh = expressionHypotheses.get(key).fdrBh;
    item.sharedExpressionFeatureCandidateCount = featureGroupCounts.get(key) ?? 1;
    item.matureArmAmbiguity = item.sharedExpressionFeatureCandidateCount > 1;
    item.molecular75Score = 0.75 * item.sequenceScore + 0.25 * item.validationScore;
    item.patient75Score = 0.25 * item.sequenceScore + 0.75 * item.validationScore;
  }

  const assignRank = (items, scoreName, rankName) => [...items].sort((left, right) => right[scoreName] - left[scoreName] || left.mirna.localeCompare(right.mirna)).forEach((item, index) => { item[rankName] = index + 1; });
  assignRank(candidateResults, "molecular75Score", "molecular75Rank");
  assignRank(candidateResults, "patient75Score", "patient75Rank");
  for (const item of candidateResults) {
    item.paretoFront = !candidateResults.some((other) => other !== item && other.sequenceScore >= item.sequenceScore && other.validationScore >= item.validationScore && (other.sequenceScore > item.sequenceScore || other.validationScore > item.validationScore));
  }

  const validationRanked = [...candidateResults].sort(
    (a, b) =>
      b.validationScore - a.validationScore ||
      b.cvMetrics.auc - a.cvMetrics.auc ||
      Math.abs(b.log2FoldChange) - Math.abs(a.log2FoldChange) ||
      b.sequenceScore - a.sequenceScore
  );
  const integratedRanked = [...candidateResults].sort(
    (a, b) => b.finalDiscoveryScore - a.finalDiscoveryScore || b.validationScore - a.validationScore
  );

  validationRanked.forEach((item, index) => {
    item.validationRank = index + 1;
  });
  integratedRanked.forEach((item, index) => {
    item.integratedRank = index + 1;
  });

  const resultByKey = new Map(candidateResults.map((item) => [`${item.mirna}|${item.sequenceRank}`, item]));
  for (const candidateModel of candidateModels) {
    const result = resultByKey.get(`${candidateModel.mirna}|${candidateModel.sequence_rank}`);
    candidateModel.validation_rank = result?.validationRank ?? null;
    candidateModel.integrated_rank = result?.integratedRank ?? null;
    candidateModel.statistical_inference = result ? {
      auc: result.aucInference,
      auc_fdr_bh: result.aucFdrBh,
      raw_expression_auc: result.rawExpressionAuc,
      cliffs_delta: result.cliffsDelta,
      hedges_g_log_expression: result.hedgesGLogExpression,
      log_expression_difference: result.logExpressionDifference,
      warning: "IC e p unilateral para AUC>0,5 usam aproximacao sobre predicoes OOF correlacionadas; o FDR e calculado por hipotese de expressao unica, valores no piso devem ser lidos como p<1e-16 e tudo permanece evidencia interna.",
    } : null;
    candidateModel.integration_sensitivity = result ? {
      molecular_75_patient_25_score: result.molecular75Score,
      molecular_75_patient_25_rank: result.molecular75Rank,
      molecular_25_patient_75_score: result.patient75Score,
      molecular_25_patient_75_rank: result.patient75Rank,
      pareto_front: result.paretoFront,
    } : null;
    candidateModel.expression_resolution = result ? {
      shared_feature_candidate_count: result.sharedExpressionFeatureCandidateCount,
      mature_arm_ambiguity: result.matureArmAmbiguity,
    } : null;
  }
  candidateModels.sort((a, b) => (a.validation_rank ?? 0) - (b.validation_rank ?? 0));

  ensureDirectory(OUTPUT_MODEL);
  ensureDirectory(OUTPUT_CSV);
  ensureDirectory(OUTPUT_INTEGRATED_CSV);
  ensureDirectory(OUTPUT_REPORT);

  const modelArtifact = {
    type: "patient_candidate_validation_models_per_candidate",
    purpose:
      "Validar computacionalmente candidatos do Modelo 1 no dataset de pacientes, medindo se a expressao do candidato ajuda a separar doentes e saudaveis.",
    input_candidate_ranking: projectPath(CANDIDATE_RANKING_CSV),
    input_sequence_model: projectPath(SEQUENCE_MODEL_JSON),
    input_dataset: projectPath(DATASET_CSV),
    output_validation_ranking: projectPath(OUTPUT_CSV),
    output_integrated_ranking: projectPath(OUTPUT_INTEGRATED_CSV),
    candidate_count: candidateResults.length,
    candidate_count_from_sequence_ranking: candidates.rows.length,
    candidate_count_skipped_without_expression: skippedWithoutExpression,
    validation_design:
      "validacao cruzada estratificada deterministica em 5 folds; amostras sao ordenadas por hash estavel do sample_id dentro de cada classe e cada amostra recebe predicao out-of-fold",
    cross_validation_folds: CV_FOLDS,
    optimizer: {
      method: "newton_raphson_for_univariate_logistic_regression",
      max_iterations: TRAIN_MAX_ITERATIONS,
      convergence_tolerance: CONVERGENCE_TOLERANCE,
      l2: L2,
    },
    per_candidate_model:
      "Para cada candidato, valida regressao logistica univariada com predicoes out-of-fold usando log1p(expressao media das features associadas); depois ajusta um modelo final em todas as amostras apenas para serializacao.",
    validation_score_formula:
      "score_validacao_pacientes = 0.70*AUC_signal + 0.20*|log2FC|_signal + 0.10*detection_presence_signal",
    final_score_formula: "score_final_descoberta = 0.50*score_modelo_sequencial + 0.50*score_validacao_pacientes",
    statistical_inference: {
      auc_interval_and_p_value: "IC Hanley-McNeil e p unilateral para AUC maior que 0,5 aplicados as predicoes out-of-fold",
      multiple_testing: `Benjamini-Hochberg sobre ${expressionHypotheses.size} hipoteses de expressao unicas; candidatos 5p/3p com as mesmas features nao sao contados como testes independentes`,
      unique_expression_hypothesis_count: expressionHypotheses.size,
      significant_unique_expression_hypothesis_count_fdr_0_05: [...expressionHypotheses.values()].filter((item) => item.fdrBh < 0.05).length,
      effect_sizes: ["Cliff's delta da expressao log1p", "Hedges g da expressao log1p", "diferenca media log1p com IC95% normal"],
      warning: "Predicoes OOF de folds diferentes nao sao independentes; p-valores unilaterais e ICs sao aproximacoes internas, valores no piso significam p<1e-16 e nao substituem coorte externa.",
    },
    integration_sensitivity: {
      scenarios: ["75% Modelo 1 + 25% Modelo 2", "50% Modelo 1 + 50% Modelo 2", "25% Modelo 1 + 75% Modelo 2"],
      pareto_front: "candidatos nao dominados simultaneamente nos scores dos Modelos 1 e 2",
    },
    ranking_definitions: {
      rank_validacao_pacientes:
        "Ranking puro do Modelo 2, ordenado por score_validacao_pacientes. Mede apenas associacao computacional no dataset de pacientes.",
      rank_integrado:
        "Ranking combinado, ordenado por score_final_descoberta. Combina hipotese sequencial do Modelo 1 com validacao computacional do Modelo 2.",
    },
    expression_level_note:
      "O dataset pode representar miRNAs em nivel de precursor/familia. Quando candidatos maduros 5p/3p compartilham a mesma feature de expressao, o Modelo 2 valida a feature disponivel, mas nao distingue experimentalmente o braco maduro.",
    sequence_model_summary: {
      type: sequenceModel.type,
      candidate_count: sequenceModel.candidate_count,
      candidate_count_global_mirbase: sequenceModel.candidate_count_global_mirbase,
      candidate_count_with_expression_available: sequenceModel.candidate_count_with_expression_available,
      vocabulary_size: sequenceModel.vocabulary_size,
    },
    candidates: candidateModels,
    warning:
      "Esta validacao e computacional. A validacao cruzada reduz o otimismo de uma unica divisao, mas o ranking ainda e selecionado no mesmo dataset e pode capturar efeito de lote/fonte. Nao substitui coorte externa nem validacao laboratorial.",
  };
  fs.writeFileSync(OUTPUT_MODEL, JSON.stringify(modelArtifact, null, 2), "utf8");

  const outputHeader = [
    "rank_validacao_pacientes",
    "rank_integrado",
    "mirna",
    "score_validacao_pacientes",
    "score_final_descoberta",
    "score_modelo_sequencial",
    "rank_modelo_sequencial",
    "features_expressao",
    "direcao_aprendida_no_paciente",
    "cv_oof_auc",
    "cv_oof_auc_ic95_inferior_aprox",
    "cv_oof_auc_ic95_superior_aprox",
    "cv_oof_auc_p_gt_0_5_unilateral_aprox",
    "cv_oof_auc_fdr_bh_aprox",
    "cv_oof_accuracy",
    "cv_oof_precision",
    "cv_oof_recall_sensibilidade",
    "cv_oof_specificity",
    "cv_oof_f1",
    "cv_oof_tp",
    "cv_oof_fp",
    "cv_oof_fn",
    "cv_oof_tn",
    "auc_expressao_bruta",
    "cliffs_delta_expressao_log1p",
    "hedges_g_expressao_log1p",
    "diferenca_media_log1p",
    "diferenca_media_log1p_ic95_inferior",
    "diferenca_media_log1p_ic95_superior",
    "log2_fc_doente_vs_saudavel",
    "media_doente",
    "media_saudavel",
    "mediana_doente",
    "mediana_saudavel",
    "pct_doentes_maior_que_zero",
    "pct_saudaveis_maior_que_zero",
    "numero_candidatos_mesma_feature_expressao",
    "ambiguidade_braco_maduro",
    "score_75_modelo1_25_modelo2",
    "rank_75_modelo1_25_modelo2",
    "score_25_modelo1_75_modelo2",
    "rank_25_modelo1_75_modelo2",
    "fronteira_pareto",
    "marcadores_referencia_mais_proximos",
    "features_modelo_mais_influentes",
    "features_kmer_mais_influentes",
  ];

  const rowsFor = (items) => items.map((item) => [
    item.validationRank,
    item.integratedRank,
    item.mirna,
    item.validationScore.toFixed(6),
    item.finalDiscoveryScore.toFixed(6),
    item.sequenceScore.toFixed(6),
    item.sequenceRank,
    item.features.join("; "),
    item.direction,
    item.cvMetrics.auc.toFixed(6),
    item.aucInference.confidence_interval_95[0].toFixed(6),
    item.aucInference.confidence_interval_95[1].toFixed(6),
    item.aucInference.p_value_auc_gt_0_5_one_sided.toExponential(6),
    item.aucFdrBh.toExponential(6),
    item.cvMetrics.accuracy.toFixed(6),
    item.cvMetrics.precision.toFixed(6),
    item.cvMetrics.recall.toFixed(6),
    item.cvMetrics.specificity.toFixed(6),
    item.cvMetrics.f1.toFixed(6),
    item.cvMetrics.tp,
    item.cvMetrics.fp,
    item.cvMetrics.fn,
    item.cvMetrics.tn,
    item.rawExpressionAuc.toFixed(6),
    item.cliffsDelta.toFixed(6),
    item.hedgesGLogExpression.toFixed(6),
    item.logExpressionDifference.difference.toFixed(6),
    item.logExpressionDifference.confidence_interval_95[0].toFixed(6),
    item.logExpressionDifference.confidence_interval_95[1].toFixed(6),
    item.log2FoldChange.toFixed(6),
    item.diseaseMean.toFixed(6),
    item.healthyMean.toFixed(6),
    item.diseaseMedian.toFixed(6),
    item.healthyMedian.toFixed(6),
    item.diseaseNonzeroPct.toFixed(2),
    item.healthyNonzeroPct.toFixed(2),
    item.sharedExpressionFeatureCandidateCount,
    item.matureArmAmbiguity ? "sim" : "nao",
    item.molecular75Score.toFixed(6),
    item.molecular75Rank,
    item.patient75Score.toFixed(6),
    item.patient75Rank,
    item.paretoFront ? "sim" : "nao",
    item.nearestMarkers,
    item.influentialKmers,
    item.influentialKmers,
  ]);
  fs.writeFileSync(OUTPUT_CSV, [outputHeader, ...rowsFor(validationRanked)].map((row) => row.map(csvCell).join(",")).join("\n"), "utf8");
  fs.writeFileSync(
    OUTPUT_INTEGRATED_CSV,
    [outputHeader, ...rowsFor(integratedRanked)].map((row) => row.map(csvCell).join(",")).join("\n"),
    "utf8"
  );

  const topValidation = validationRanked.slice(0, TOP_REPORT_COUNT);
  const topIntegrated = integratedRanked.slice(0, TOP_REPORT_COUNT);
  const report = [
    "Modelo de validacao computacional de candidatos em pacientes",
    "",
    `Ranking de candidatos do Modelo 1: ${projectPath(CANDIDATE_RANKING_CSV)}`,
    `Modelo sequencial usado: ${projectPath(SEQUENCE_MODEL_JSON)}`,
    `Dataset de pacientes: ${projectPath(DATASET_CSV)}`,
    `Ranking puro do Modelo 2: ${projectPath(OUTPUT_CSV)}`,
    `Ranking integrado Modelo 1 + Modelo 2: ${projectPath(OUTPUT_INTEGRATED_CSV)}`,
    `Candidatos recebidos do ranking sequencial global: ${candidates.rows.length}`,
    `Candidatos validados: ${candidateResults.length}`,
    `Candidatos ignorados por falta de expressao no dataset: ${skippedWithoutExpression}`,
    `Hipoteses de expressao unicas avaliadas: ${expressionHypotheses.size}`,
    `Hipoteses unicas com FDR BH aproximado < 0.05 para AUC > 0.5: ${[...expressionHypotheses.values()].filter((item) => item.fdrBh < 0.05).length}`,
    `Candidatos associados a essas hipoteses significativas: ${candidateResults.filter((item) => item.aucFdrBh < 0.05).length}`,
    `Candidatos com ambiguidade de braco por feature compartilhada: ${candidateResults.filter((item) => item.matureArmAmbiguity).length}`,
    `Candidatos na fronteira de Pareto dos dois scores: ${candidateResults.filter((item) => item.paretoFront).length}`,
    "",
    "Tipo do Modelo 2:",
    "patient_candidate_validation_models_per_candidate",
    "",
    "Como o Modelo 2 funciona:",
    "Para cada candidato do Modelo 1, o script localiza as features correspondentes no dataset de pacientes.",
    "Candidatos do ranking sequencial global sem feature de expressao no dataset atual sao mantidos no Modelo 1, mas ignorados nesta validacao.",
    "Para cada candidato, executa validacao cruzada estratificada em 5 folds com regressao logistica univariada e expressao log1p.",
    "Cada amostra recebe uma predicao out-of-fold de um modelo que nao a utilizou no treinamento; as metricas CV-OOF agregam essas predicoes.",
    "Depois da avaliacao, um modelo final e ajustado em todas as amostras apenas para ser armazenado no artefato JSON.",
    "Isso funciona como uma prova computacional: verifica se o candidato aparece e se sua expressao tem associacao com pacientes doentes no dataset atual.",
    "",
    "Formula de validacao em pacientes:",
    "score_validacao_pacientes = 0.70*AUC_signal + 0.20*|log2FC|_signal + 0.10*detection_presence_signal",
    "score_final_descoberta = 0.50*score_modelo_sequencial + 0.50*score_validacao_pacientes",
    "Analise de sensibilidade adicional: 75/25 e 25/75, alem da fronteira de Pareto.",
    "Inferencia adicional: IC95% e p unilateral aproximado para AUC > 0.5, FDR Benjamini-Hochberg por hipotese de expressao unica e tamanhos de efeito. Como as predicoes OOF sao correlacionadas, esses valores continuam sendo internos.",
    "",
    "Observacao sobre nivel de expressao:",
    "O dataset de expressao usa varias colunas em nivel de precursor/familia. Quando candidatos maduros diferentes compartilham a mesma feature de expressao, o Modelo 2 valida a associacao da feature disponivel, mas nao distingue experimentalmente 5p vs 3p.",
    "",
    "Top candidatos por validacao em pacientes:",
    ...topValidation.map(
      (item, index) =>
        `${index + 1}. ${item.mirna}\t` +
        `rank_integrado=${item.integratedRank}\t` +
        `validacao=${item.validationScore.toFixed(4)}\t` +
        `score_final=${item.finalDiscoveryScore.toFixed(4)}\t` +
        `seq=${item.sequenceScore.toFixed(4)}\t` +
        `cv_oof_auc=${item.cvMetrics.auc.toFixed(3)}\t` +
        `fdr_aprox=${item.aucFdrBh.toExponential(2)}\t` +
        `cv_oof_acc=${item.cvMetrics.accuracy.toFixed(3)}\t` +
        `cv_oof_precision=${item.cvMetrics.precision.toFixed(3)}\t` +
        `log2FC=${item.log2FoldChange.toFixed(3)}\t` +
        `direcao=${item.direction}\t` +
        `features=${item.features.join(", ")}`
    ),
    "",
    "Top candidatos por score integrado:",
    ...topIntegrated.map(
      (item, index) =>
        `${index + 1}. ${item.mirna}\t` +
        `rank_validacao=${item.validationRank}\t` +
        `score_final=${item.finalDiscoveryScore.toFixed(4)}\t` +
        `seq=${item.sequenceScore.toFixed(4)}\t` +
        `validacao=${item.validationScore.toFixed(4)}\t` +
        `cv_oof_auc=${item.cvMetrics.auc.toFixed(3)}\t` +
        `fdr_aprox=${item.aucFdrBh.toExponential(2)}\t` +
        `cv_oof_acc=${item.cvMetrics.accuracy.toFixed(3)}\t` +
        `cv_oof_precision=${item.cvMetrics.precision.toFixed(3)}\t` +
        `log2FC=${item.log2FoldChange.toFixed(3)}\t` +
        `direcao=${item.direction}\t` +
        `features=${item.features.join(", ")}`
    ),
    "",
    "Como interpretar:",
    "O ranking por validacao em pacientes mostra apenas a forca da associacao computacional no dataset atual.",
    "O ranking integrado combina suporte sequencial do Modelo 1 e validacao computacional do Modelo 2.",
    "A direcao aprendida indica se maior ou menor expressao do candidato puxa o mini-modelo para classe doente.",
    "Isso nao prova causalidade nem valida clinicamente o biomarcador; apenas prioriza hipoteses para investigacao.",
    "",
    "Aviso cientifico:",
    "A validacao cruzada reduz dependencia de uma unica divisao treino/teste, mas o ranking continua sendo escolhido no mesmo dataset.",
    "Os dados podem refletir efeito de lote/fonte. Coorte externa independente e validacao laboratorial continuam necessarias.",
    "",
  ].join("\n");

  fs.writeFileSync(OUTPUT_REPORT, report, "utf8");
  console.log(report);
}

main();
