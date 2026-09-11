const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const DATASET_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const CANDIDATE_RANKING_CSV = fromRoot("data", "processed", "mirna_candidate_discovery_model_ranking.csv");
const SEQUENCE_MODEL_JSON = fromRoot("models", "modelo_mirna_candidate_discovery.json");

const OUTPUT_MODEL = fromRoot("models", "modelo_mirna_patient_candidate_validation.json");
const OUTPUT_CSV = fromRoot("data", "processed", "mirna_patient_candidate_validation.csv");
const OUTPUT_INTEGRATED_CSV = fromRoot("data", "processed", "mirna_patient_candidate_integrated_ranking.csv");
const OUTPUT_REPORT = fromRoot("reports", "modelo_mirna_patient_candidate_validation_report.txt");

const TRAIN_EPOCHS = 900;
const LEARNING_RATE = 0.15;
const L2 = 0.01;
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

function stratifiedSplit(samples) {
  const byLabel = new Map();
  for (const sample of samples) {
    const current = byLabel.get(sample.label) ?? [];
    current.push(sample);
    byLabel.set(sample.label, current);
  }

  const train = [];
  const test = [];
  for (const group of byLabel.values()) {
    group.forEach((sample, index) => {
      if (index % 5 === 0) test.push(sample);
      else train.push(sample);
    });
  }
  return { train, test };
}

function trainUnivariateLogistic(trainSamples) {
  const trainValues = trainSamples.map((sample) => sample.value);
  const center = mean(trainValues);
  const scale = std(trainValues) || 1;
  let weight = 0;
  let bias = 0;
  const history = [];

  for (let epoch = 0; epoch < TRAIN_EPOCHS; epoch += 1) {
    let gradWeight = 0;
    let gradBias = 0;
    let loss = 0;
    for (const sample of trainSamples) {
      const x = (sample.value - center) / scale;
      const probability = sigmoid(weight * x + bias);
      const clipped = Math.min(1 - 1e-9, Math.max(1e-9, probability));
      loss += -(sample.label * Math.log(clipped) + (1 - sample.label) * Math.log(1 - clipped));
      const error = probability - sample.label;
      gradWeight += error * x;
      gradBias += error;
    }

    const lr = LEARNING_RATE / Math.sqrt(1 + epoch / 100);
    weight -= lr * (gradWeight / Math.max(1, trainSamples.length) + L2 * weight);
    bias -= lr * (gradBias / Math.max(1, trainSamples.length));

    if (epoch === 0 || (epoch + 1) % 150 === 0 || epoch === TRAIN_EPOCHS - 1) {
      history.push({ epoch: epoch + 1, log_loss: loss / Math.max(1, trainSamples.length) });
    }
  }

  return { weight, bias, center, scale, history };
}

function predict(model, value) {
  const x = (value - model.center) / model.scale;
  return sigmoid(model.weight * x + model.bias);
}

function expressionValueForRow(row, dataset, features) {
  return (
    features.reduce((sum, feature) => sum + (Number(row[dataset.indexByName.get(feature)]) || 0), 0) /
    Math.max(1, features.length)
  );
}

function validationEvidenceScore(item) {
  const aucSignal = Math.max(0, (item.testMetrics.auc - 0.5) * 2);
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
  const classIndex = dataset.indexByName.get("classe");
  if (typeof classIndex !== "number") throw new Error(`Coluna classe ausente em ${DATASET_CSV}`);

  const datasetSamples = dataset.rows.map((row) => ({
    label: Number(row[classIndex]),
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

    const samples = datasetSamples.map((sample, index) => ({
      index,
      label: sample.label,
      value: Math.log1p(Math.max(0, expressionValueForRow(sample.row, dataset, features))),
      rawValue: expressionValueForRow(sample.row, dataset, features),
    }));

    const { train, test } = stratifiedSplit(samples);
    const model = trainUnivariateLogistic(train);
    const trainPredictions = train.map((sample) => ({ ...sample, probability: predict(model, sample.value) }));
    const testPredictions = test.map((sample) => ({ ...sample, probability: predict(model, sample.value) }));
    const trainMetrics = metricsFromPredictions(trainPredictions);
    const testMetrics = metricsFromPredictions(testPredictions);

    const diseaseRaw = samples.filter((sample) => sample.label === 1).map((sample) => sample.rawValue);
    const healthyRaw = samples.filter((sample) => sample.label === 0).map((sample) => sample.rawValue);
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
      model,
      trainMetrics,
      testMetrics,
      diseaseMean,
      healthyMean,
      diseaseMedian: median(diseaseRaw),
      healthyMedian: median(healthyRaw),
      log2FoldChange,
      diseaseNonzeroPct,
      healthyNonzeroPct,
      direction: directionFromWeight(model.weight),
      nearestMarkers: get("marcadores_referencia_mais_proximos"),
      influentialKmers: get("features_kmer_mais_influentes"),
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
        weight: model.weight,
        bias: model.bias,
        center_log1p: model.center,
        scale_log1p: model.scale,
        direction: result.direction,
      },
      train_metrics: trainMetrics,
      test_metrics: testMetrics,
      validation_score: result.validationScore,
      final_discovery_score: result.finalDiscoveryScore,
    });
  }

  const validationRanked = [...candidateResults].sort(
    (a, b) =>
      b.validationScore - a.validationScore ||
      b.testMetrics.auc - a.testMetrics.auc ||
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
    input_candidate_ranking: CANDIDATE_RANKING_CSV,
    input_sequence_model: SEQUENCE_MODEL_JSON,
    input_dataset: DATASET_CSV,
    output_validation_ranking: OUTPUT_CSV,
    output_integrated_ranking: OUTPUT_INTEGRATED_CSV,
    candidate_count: candidateResults.length,
    candidate_count_from_sequence_ranking: candidates.rows.length,
    candidate_count_skipped_without_expression: skippedWithoutExpression,
    train_test_split: "estratificado deterministico 80/20 por classe",
    per_candidate_model:
      "Para cada candidato, treina regressao logistica univariada usando log1p(expressao media das features associadas).",
    validation_score_formula:
      "score_validacao_pacientes = 0.70*AUC_signal + 0.20*|log2FC|_signal + 0.10*detection_presence_signal",
    final_score_formula: "score_final_descoberta = 0.50*score_modelo_sequencial + 0.50*score_validacao_pacientes",
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
      "Esta validacao e computacional. Ela testa associacao no dataset atual, mas pode capturar efeito de lote/fonte e nao substitui validacao laboratorial.",
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
    "test_auc",
    "test_accuracy",
    "test_precision",
    "test_recall_sensibilidade",
    "test_specificity",
    "test_f1",
    "test_tp",
    "test_fp",
    "test_fn",
    "test_tn",
    "log2_fc_doente_vs_saudavel",
    "media_doente",
    "media_saudavel",
    "mediana_doente",
    "mediana_saudavel",
    "pct_doentes_maior_que_zero",
    "pct_saudaveis_maior_que_zero",
    "marcadores_referencia_mais_proximos",
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
    item.testMetrics.auc.toFixed(6),
    item.testMetrics.accuracy.toFixed(6),
    item.testMetrics.precision.toFixed(6),
    item.testMetrics.recall.toFixed(6),
    item.testMetrics.specificity.toFixed(6),
    item.testMetrics.f1.toFixed(6),
    item.testMetrics.tp,
    item.testMetrics.fp,
    item.testMetrics.fn,
    item.testMetrics.tn,
    item.log2FoldChange.toFixed(6),
    item.diseaseMean.toFixed(6),
    item.healthyMean.toFixed(6),
    item.diseaseMedian.toFixed(6),
    item.healthyMedian.toFixed(6),
    item.diseaseNonzeroPct.toFixed(2),
    item.healthyNonzeroPct.toFixed(2),
    item.nearestMarkers,
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
    `Ranking de candidatos do Modelo 1: ${CANDIDATE_RANKING_CSV}`,
    `Modelo sequencial usado: ${SEQUENCE_MODEL_JSON}`,
    `Dataset de pacientes: ${DATASET_CSV}`,
    `Ranking puro do Modelo 2: ${OUTPUT_CSV}`,
    `Ranking integrado Modelo 1 + Modelo 2: ${OUTPUT_INTEGRATED_CSV}`,
    `Candidatos recebidos do ranking sequencial global: ${candidates.rows.length}`,
    `Candidatos validados: ${candidateResults.length}`,
    `Candidatos ignorados por falta de expressao no dataset: ${skippedWithoutExpression}`,
    "",
    "Tipo do Modelo 2:",
    "patient_candidate_validation_models_per_candidate",
    "",
    "Como o Modelo 2 funciona:",
    "Para cada candidato do Modelo 1, o script localiza as features correspondentes no dataset de pacientes.",
    "Candidatos do ranking sequencial global sem feature de expressao no dataset atual sao mantidos no Modelo 1, mas ignorados nesta validacao.",
    "Depois treina uma regressao logistica univariada usando apenas a expressao log1p daquele candidato para separar classe=1 de classe=0.",
    "Isso funciona como uma prova computacional: verifica se o candidato aparece e se sua expressao tem associacao com pacientes doentes no dataset atual.",
    "",
    "Formula de validacao em pacientes:",
    "score_validacao_pacientes = 0.70*AUC_signal + 0.20*|log2FC|_signal + 0.10*detection_presence_signal",
    "score_final_descoberta = 0.50*score_modelo_sequencial + 0.50*score_validacao_pacientes",
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
        `test_auc=${item.testMetrics.auc.toFixed(3)}\t` +
        `test_acc=${item.testMetrics.accuracy.toFixed(3)}\t` +
        `precision=${item.testMetrics.precision.toFixed(3)}\t` +
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
        `test_auc=${item.testMetrics.auc.toFixed(3)}\t` +
        `test_acc=${item.testMetrics.accuracy.toFixed(3)}\t` +
        `precision=${item.testMetrics.precision.toFixed(3)}\t` +
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
    "A validacao usa o dataset atual e pode refletir efeito de lote/fonte. Validacao laboratorial ou coorte externa independente continua necessaria.",
    "",
  ].join("\n");

  fs.writeFileSync(OUTPUT_REPORT, report, "utf8");
  console.log(report);
}

main();
