const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const DATASET_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const SEQUENCE_RANKING_CSV = fromRoot("data", "processed", "mirna_sequence_candidate_ranking.csv");
const SEQUENCE_MODEL_JSON = fromRoot("models", "modelo_mirna_sequence_patterns.json");
const OUTPUT_CSV = fromRoot("data", "processed", "mirna_integrated_candidate_evidence.csv");
const OUTPUT_REPORT = fromRoot("reports", "mirna_integrated_candidate_evidence_report.txt");

const TOP_REPORT_COUNT = 30;

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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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

function parseNearestMarkers(text) {
  if (!text) return [];
  return text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [marker, similarity] = part.split(":");
      return { marker: marker?.trim() ?? "", similarity: Number(similarity) || 0 };
    });
}

function markerWeight(metadata) {
  const priority = (metadata?.prioridade_projeto || metadata?.recorrencia_bibliografica || "").toLowerCase().trim();
  if (priority === "alta") return 3;
  if (priority === "media") return 2;
  if (priority === "painel_inicial") return 2;
  return 1;
}

function expressionScore(metrics) {
  // Este score resume separacao doente/saudavel no dataset atual. Ele nao e
  // diagnostico; serve para priorizar hipoteses que tambem mostram sinal em
  // expressao, alem da similaridade sequencial.
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

function main() {
  const sequenceRanking = readCsv(SEQUENCE_RANKING_CSV);
  const dataset = readCsv(DATASET_CSV);
  const sequenceModel = JSON.parse(fs.readFileSync(SEQUENCE_MODEL_JSON, "utf8"));

  const metadataByMarker = new Map();
  for (const marker of sequenceModel.known_markers_with_sequence ?? []) {
    metadataByMarker.set(marker.marker, marker.metadata ?? {});
  }

  const classIndex = dataset.indexByName.get("classe");
  const expressionRows = dataset.rows.map((row) => ({
    label: Number(row[classIndex]),
    row,
  }));

  const integrated = sequenceRanking.rows.map((row) => {
    const get = (name) => row[sequenceRanking.indexByName.get(name)] ?? "";
    const candidate = get("mirna");
    const featureText = get("features_expressao_associadas");
    const features = featureText
      .split(";")
      .map((item) => item.trim())
      .filter((item) => dataset.indexByName.has(item));

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
    const diseaseLoggedMean = mean(diseaseLogged);
    const healthyLoggedMean = mean(healthyLogged);
    const pooledStd = Math.sqrt((std(diseaseLogged) ** 2 + std(healthyLogged) ** 2) / 2) || 1;
    const cohenD = (diseaseLoggedMean - healthyLoggedMean) / pooledStd;
    const auc = computeAuc(diseaseLogged, healthyLogged);
    const absAuc = Math.max(auc, 1 - auc);
    const diseaseNonzeroPct = (disease.filter((value) => value > 0).length / disease.length) * 100;
    const healthyNonzeroPct = (healthy.filter((value) => value > 0).length / healthy.length) * 100;
    const log2FoldChange = Math.log2((diseaseMean + 1) / (healthyMean + 1));

    const nearestMarkers = parseNearestMarkers(get("marcadores_mais_proximos"));
    const nearestSupportWeights = nearestMarkers.map((item) => markerWeight(metadataByMarker.get(item.marker)));
    const referenceSupport = Math.max(0, ...nearestSupportWeights) / 3;

    const metrics = {
      log2FoldChange,
      absAuc,
      diseaseNonzeroPct,
      healthyNonzeroPct,
    };
    const exprScore = expressionScore(metrics);
    const sequenceScore = Number(get("score_hipotese")) || 0;
    const integratedScore = 0.45 * sequenceScore + 0.45 * exprScore + 0.1 * referenceSupport;

    return {
      candidate,
      sequenceScore,
      expressionScore: exprScore,
      referenceSupport,
      integratedScore,
      features,
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
      nearestMarkers,
      sharedMotifs: get("motifs_compartilhados"),
    };
  });

  integrated.sort((a, b) => b.integratedScore - a.integratedScore);

  const outputHeader = [
    "rank_integrado",
    "mirna",
    "score_integrado",
    "score_sequencial",
    "score_expressao",
    "suporte_recorrencia_referencias",
    "features_expressao",
    "direcao_doente_vs_saudavel",
    "log2_fc_doente_vs_saudavel",
    "auc_univariada_doente",
    "auc_direcional_absoluta",
    "cohen_d_log1p",
    "media_doente",
    "media_saudavel",
    "mediana_doente",
    "mediana_saudavel",
    "pct_doentes_maior_que_zero",
    "pct_saudaveis_maior_que_zero",
    "marcadores_referencia_mais_proximos",
    "motifs_compartilhados",
  ];

  const outputRows = integrated.map((item, index) => [
    index + 1,
    item.candidate,
    item.integratedScore.toFixed(6),
    item.sequenceScore.toFixed(6),
    item.expressionScore.toFixed(6),
    item.referenceSupport.toFixed(6),
    item.features.join("; "),
    item.direction,
    item.log2FoldChange.toFixed(6),
    item.auc.toFixed(6),
    item.absAuc.toFixed(6),
    item.cohenD.toFixed(6),
    item.diseaseMean.toFixed(6),
    item.healthyMean.toFixed(6),
    item.diseaseMedian.toFixed(6),
    item.healthyMedian.toFixed(6),
    item.diseaseNonzeroPct.toFixed(2),
    item.healthyNonzeroPct.toFixed(2),
    item.nearestMarkers.map((marker) => `${marker.marker}:${marker.similarity.toFixed(3)}`).join("; "),
    item.sharedMotifs,
  ]);

  fs.writeFileSync(OUTPUT_CSV, [outputHeader, ...outputRows].map((line) => line.map(csvCell).join(",")).join("\n"));

  const top = integrated.slice(0, TOP_REPORT_COUNT);
  const report = [
    "Evidencia integrada de candidatos miRNA",
    "",
    `Ranking sequencial usado: ${SEQUENCE_RANKING_CSV}`,
    `Dataset de expressao usado: ${DATASET_CSV}`,
    `Modelo/perfil sequencial usado: ${SEQUENCE_MODEL_JSON}`,
    `Candidatos avaliados: ${integrated.length}`,
    "",
    "Formula do score integrado:",
    "score_integrado = 0.45 * score_sequencial + 0.45 * score_expressao + 0.10 * suporte_recorrencia_referencias",
    "",
    "O score_expressao combina AUC univariada absoluta, magnitude de log2 fold-change e diferenca de presenca >0 entre doentes e saudaveis.",
    "O suporte_recorrencia_referencias vem dos biomarcadores positivos mais proximos por sequencia: alta=1.00, media/painel=0.67, exploratoria=0.33.",
    "",
    "Top candidatos por evidencia integrada:",
    ...top.map(
      (item, index) =>
        `${index + 1}. ${item.candidate}\t` +
        `score_integrado=${item.integratedScore.toFixed(4)}\t` +
        `seq=${item.sequenceScore.toFixed(4)}\t` +
        `expr=${item.expressionScore.toFixed(4)}\t` +
        `log2FC=${item.log2FoldChange.toFixed(3)}\t` +
        `AUC_abs=${item.absAuc.toFixed(3)}\t` +
        `direcao=${item.direction}\t` +
        `features=${item.features.join(", ")}\t` +
        `referencias=${item.nearestMarkers.map((marker) => `${marker.marker}:${marker.similarity.toFixed(3)}`).join(", ")}`
    ),
    "",
    "Aviso cientifico:",
    "Esta analise gera candidatos, marcadores suspeitos e hipoteses computacionais. Nenhum miRNA listado deve ser tratado como diagnostico definitivo, biomarcador validado ou evidencia clinica sem validacao experimental/laboratorial.",
    "",
  ].join("\n");

  fs.writeFileSync(OUTPUT_REPORT, report, "utf8");
  console.log(report);
}

main();
