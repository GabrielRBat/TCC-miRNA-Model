"use strict";
/*
 * Analises de sensibilidade pos-hoc do fluxo de descoberta de miRNAs.
 *
 * Estas analises foram pedidas na revisao da monografia e sao executadas DEPOIS
 * de conhecidos os resultados da coorte externa. Elas nao alteram os artefatos
 * congelados (modelos, listas ordenadas, direcoes esperadas): cada variante roda
 * em uma copia de trabalho isolada (tmp_sensibilidade/<variante>/).
 *
 * O que e calculado:
 *   1. Modelo 1 retreinado com conjuntos positivos alternativos
 *      - referencia_43 ............ conjunto original (controle de reproducao)
 *      - sem_shimomura_38 ......... sem os 5 positivos de Shimomura et al. (2016a)
 *      - sem_fonte_unica_zou_33 ... sem os 10 positivos cuja unica fonte e o painel de Zou et al. (2021)
 *      - fonte_unica_zou_peso_1 ... os mesmos 10 positivos com peso 1 (em vez de 2)
 *   2. Diferenca pareada, por familia de regiao-semente, entre o Modelo 1 e cada
 *      linha de base (bootstrap pareado e teste de inversao de sinais).
 *   3. Reproducao externa (GSE73002) nos 10/50/100 primeiros de cada ordenacao:
 *      Modelo 1 sozinho, lista integrada 50/50 e Modelo 2 sozinho, sempre nos
 *      mesmos 611 candidatos da lista congelada e com os resultados externos ja
 *      publicados em data/processed/gse73002_ts_external_validation*.csv.
 *
 * Uso:
 *   node scripts/run_sensitivity_analyses.js                 # roda o que faltar e resume
 *   node scripts/run_sensitivity_analyses.js --only=<id>     # roda so uma variante
 *   node scripts/run_sensitivity_analyses.js --summary       # so resume (variantes ja rodadas)
 *   node scripts/run_sensitivity_analyses.js --force         # refaz todas as variantes
 *
 * Saidas:
 *   reports/analise_sensibilidade_pos_hoc.json
 *   reports/analise_sensibilidade_pos_hoc.txt
 *   reports/analise_sensibilidade_pos_hoc.csv
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const WORK_ROOT = fromRoot("tmp_sensibilidade");

const TRAIN_SCRIPT = path.join("scripts", "train_mirna_candidate_discovery_model.js");
const MODEL2_SCRIPT = path.join("scripts", "validate_mirna_candidates_in_patients_model.js");
const POSITIVES = path.join("data", "external", "breast_cancer_mirna_positive_markers.csv");
const POLICY = path.join("data", "external", "breast_cancer_mirna_training_policy.csv");
const COPIED_INPUTS = [
  path.join("data", "external", "mirbase_mature.fa"),
  path.join("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv"),
];
const MODEL1_JSON = path.join("models", "modelo_mirna_candidate_discovery.json");
const INTEGRATED_CSV = path.join("data", "processed", "mirna_patient_candidate_integrated_ranking.csv");
const EXTERNAL_PRIMARY = fromRoot("data", "processed", "gse73002_ts_external_validation.csv");
const EXTERNAL_CENTERED = fromRoot("data", "processed", "gse73002_ts_external_validation_centered_sensitivity.csv");

const OUT_JSON = fromRoot("reports", "analise_sensibilidade_pos_hoc.json");
const OUT_TXT = fromRoot("reports", "analise_sensibilidade_pos_hoc.txt");
const OUT_CSV = fromRoot("reports", "analise_sensibilidade_pos_hoc.csv");

const BOOTSTRAP_ITERATIONS = 4000;
const SIGN_FLIP_ITERATIONS = 10000;
const TOP_CUTS = [10, 50, 100];

const SHIMOMURA_POSITIVES = ["hsa-miR-1246", "hsa-miR-1307-3p", "hsa-miR-4634", "hsa-miR-6861-5p", "hsa-miR-6875-5p"];

// Positivos do painel inicial do projeto cuja unica fonte e o painel serico de 12 miRNAs de
// Zou et al. (2021), Cancer Biomarkers 30(1):41-53. Os outros dois miRNAs do painel
// (miR-16-5p e miR-19a-3p) tambem tem outras publicacoes e ficam fora desta lista.
const ZOU_2021 = "Zou et al. (2021), Cancer Biomarkers 30(1):41-53, DOI 10.3233/CBM-201547";
const ZOU_ONLY_POSITIVES = ["hsa-let-7b-5p", "hsa-miR-106a-5p", "hsa-miR-19b-3p", "hsa-miR-20a-5p", "hsa-miR-223-3p", "hsa-miR-25-3p", "hsa-miR-425-5p", "hsa-miR-451a", "hsa-miR-92a-3p", "hsa-miR-93-5p"];

// Trecho do script de treino que exporta as linhas de base. Na copia de trabalho,
// ele passa a exportar tambem o percentil por familia de cada linha de base, que e
// necessario para a comparacao pareada. O script versionado nao e modificado.
const EXPORT_ANCHOR = "[name, { marker_metrics: value.marker_metrics, family_metrics: value.family_metrics }]";
const EXPORT_PATCH = "[name, { marker_metrics: value.marker_metrics, family_metrics: value.family_metrics, family_details: value.family_details }]";

// ---------------------------------------------------------------- utilidades
function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else current += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { cells.push(current); current = ""; }
    else current += character;
  }
  cells.push(current);
  return cells;
}

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.length > 0);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
  return { header, rows, lines };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function averageRanks(values) {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const ranks = new Array(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end += 1;
    const rank = (start + end) / 2 + 1;
    for (let index = start; index <= end; index += 1) ranks[order[index].index] = rank;
    start = end + 1;
  }
  return ranks;
}

function spearman(left, right) {
  const leftRanks = averageRanks(left);
  const rightRanks = averageRanks(right);
  const leftMean = mean(leftRanks);
  const rightMean = mean(rightRanks);
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < leftRanks.length; index += 1) {
    covariance += (leftRanks[index] - leftMean) * (rightRanks[index] - rightMean);
    leftVariance += (leftRanks[index] - leftMean) ** 2;
    rightVariance += (rightRanks[index] - rightMean) ** 2;
  }
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

// ---------------------------------------------------------------- variantes
function singleSourcePanelMarkers() {
  const known = new Set(readCsv(fromRoot(POSITIVES)).rows.map((row) => row.resolved_mature_mirna));
  const missing = ZOU_ONLY_POSITIVES.filter((marker) => !known.has(marker));
  if (missing.length) throw new Error(`Positivos de fonte unica ausentes da lista curada: ${missing.join(", ")}`);
  return ZOU_ONLY_POSITIVES;
}

function buildVariants() {
  const singleSource = singleSourcePanelMarkers();
  // seedKey fixa a semente das reamostragens pareadas; foi mantida da primeira execucao
  // para que os intervalos nao mudem com a renomeacao das variantes.
  return [
    { id: "referencia_43", seedKey: "referencia_43", label: "43 positivos (referencia)", removed: [], reweighted: [] },
    { id: "sem_shimomura_38", seedKey: "sem_shimomura_38", label: "38 positivos (sem os 5 de Shimomura et al., 2016a)", removed: SHIMOMURA_POSITIVES, reweighted: [] },
    { id: "sem_fonte_unica_zou_33", seedKey: "sem_painel_sem_fonte_33", label: "33 positivos (sem os 10 cuja unica fonte e Zou et al., 2021)", removed: singleSource, reweighted: [] },
    { id: "fonte_unica_zou_peso_1", seedKey: "painel_sem_fonte_peso_1", label: "43 positivos (os 10 de fonte unica em Zou et al., 2021, com peso 1)", removed: [], reweighted: singleSource },
  ];
}

function filterCsvByMarker(sourcePath, targetPath, removed, reweighted) {
  const { header, lines } = readCsv(sourcePath);
  const keyIndex = header.indexOf("resolved_mature_mirna");
  const weightIndex = header.indexOf("training_weight");
  const removedSet = new Set(removed);
  const reweightedSet = new Set(reweighted);
  let removedCount = 0;
  let reweightedCount = 0;
  const output = [lines[0]];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const key = cells[keyIndex];
    if (removedSet.has(key)) { removedCount += 1; continue; }
    if (weightIndex >= 0 && reweightedSet.has(key)) {
      cells[weightIndex] = "1";
      reweightedCount += 1;
      output.push(cells.map(csvCell).join(","));
      continue;
    }
    output.push(line);
  }
  if (removedCount !== removedSet.size) throw new Error(`${path.basename(sourcePath)}: removidos ${removedCount}, esperados ${removedSet.size}`);
  if (weightIndex >= 0 && reweightedCount !== reweightedSet.size) throw new Error(`${path.basename(sourcePath)}: repesados ${reweightedCount}, esperados ${reweightedSet.size}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${output.join("\n")}\n`);
}

function prepareWorkspace(variant) {
  const work = path.join(WORK_ROOT, variant.id);
  fs.rmSync(work, { recursive: true, force: true });
  for (const relative of COPIED_INPUTS) {
    fs.mkdirSync(path.dirname(path.join(work, relative)), { recursive: true });
    fs.copyFileSync(fromRoot(relative), path.join(work, relative));
  }
  filterCsvByMarker(fromRoot(POSITIVES), path.join(work, POSITIVES), variant.removed, []);
  filterCsvByMarker(fromRoot(POLICY), path.join(work, POLICY), variant.removed, variant.reweighted);
  fs.mkdirSync(path.join(work, "scripts"), { recursive: true });
  const trainSource = fs.readFileSync(fromRoot(TRAIN_SCRIPT), "utf8");
  if (trainSource.split(EXPORT_ANCHOR).length !== 2) throw new Error("Trecho de exportacao das linhas de base nao encontrado (ou repetido) no script de treino");
  fs.writeFileSync(path.join(work, TRAIN_SCRIPT), trainSource.replace(EXPORT_ANCHOR, EXPORT_PATCH));
  fs.copyFileSync(fromRoot(MODEL2_SCRIPT), path.join(work, MODEL2_SCRIPT));
  return work;
}

function runVariant(variant, force) {
  const work = path.join(WORK_ROOT, variant.id);
  const done = path.join(work, "CONCLUIDO");
  if (!force && fs.existsSync(done)) { console.log(`[${variant.id}] ja executada; use --force para refazer`); return; }
  prepareWorkspace(variant);
  for (const script of [TRAIN_SCRIPT, MODEL2_SCRIPT]) {
    console.log(`[${variant.id}] executando ${script} ...`);
    const output = execFileSync(process.execPath, [script], { cwd: work, maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(path.join(work, `${path.basename(script, ".js")}.log`), output);
  }
  fs.writeFileSync(done, `${new Date().toISOString()}\n`);
}

// ---------------------------------------------------------------- resumo
function pairedComparison(modelFamilies, baselineFamilies, label) {
  const baselineByFamily = new Map(baselineFamilies.map((item) => [item.seed_family, item.percentile]));
  const deltas = modelFamilies.map((item) => {
    if (!baselineByFamily.has(item.seed_family)) throw new Error(`Familia ausente na linha de base: ${item.seed_family}`);
    return item.percentile - baselineByFamily.get(item.seed_family);
  });
  const observed = mean(deltas);
  const bootstrapRandom = mulberry32(stableHash(`sensibilidade-bootstrap|${label}`));
  const bootstrapMeans = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    bootstrapMeans.push(mean(Array.from({ length: deltas.length }, () => deltas[Math.floor(bootstrapRandom() * deltas.length)])));
  }
  const signRandom = mulberry32(stableHash(`sensibilidade-sign-flip|${label}`));
  let atLeastObserved = 0;
  for (let iteration = 0; iteration < SIGN_FLIP_ITERATIONS; iteration += 1) {
    const permuted = mean(deltas.map((delta) => (signRandom() < 0.5 ? delta : -delta)));
    if (Math.abs(permuted) >= Math.abs(observed)) atLeastObserved += 1;
  }
  return {
    mean_paired_delta: observed,
    bootstrap_95_ci: [quantile(bootstrapMeans, 0.025), quantile(bootstrapMeans, 0.975)],
    sign_flip_p_value_two_sided: (atLeastObserved + 1) / (SIGN_FLIP_ITERATIONS + 1),
    families: deltas.length,
    families_model_better: deltas.filter((value) => value > 1e-12).length,
    families_model_worse: deltas.filter((value) => value < -1e-12).length,
  };
}

function loadExternal(filePath) {
  const byName = new Map();
  for (const row of readCsv(filePath).rows) {
    byName.set(row.mirna, {
      exact: row.resolucao_mapeamento === "miRNA_maduro_exato",
      reproduced: row.replicacao_madura_exata === "sim",
      auc: Number(row.auc_externa_direcional),
    });
  }
  return byName;
}

function evaluateOrdering(ordered, primary, centered, scoreOf) {
  const cuts = {};
  for (const cut of TOP_CUTS) {
    const top = ordered.slice(0, cut);
    const evaluable = top.filter((row) => primary.get(row.mirna)?.exact);
    cuts[`top_${cut}`] = {
      evaluable: evaluable.length,
      reproduced_primary: evaluable.filter((row) => primary.get(row.mirna).reproduced).length,
      reproduced_both: evaluable.filter((row) => primary.get(row.mirna).reproduced && centered.get(row.mirna)?.reproduced).length,
    };
  }
  const exact = ordered.filter((row) => primary.get(row.mirna)?.exact);
  return {
    ...cuts,
    exact_candidates: exact.length,
    spearman_score_vs_external_auc_primary: spearman(exact.map(scoreOf), exact.map((row) => primary.get(row.mirna).auc)),
    spearman_score_vs_external_auc_centered: spearman(exact.map(scoreOf), exact.map((row) => centered.get(row.mirna).auc)),
  };
}

function summarizeVariant(variant, referenceCandidates, primary, centered) {
  const work = path.join(WORK_ROOT, variant.id);
  if (!fs.existsSync(path.join(work, "CONCLUIDO"))) throw new Error(`Variante ainda nao executada: ${variant.id}`);
  const model = JSON.parse(fs.readFileSync(path.join(work, MODEL1_JSON), "utf8"));
  const validation = model.internal_recovery_validation;
  const family = validation.family_metrics;
  const baselines = {};
  for (const [name, value] of Object.entries(validation.baselines)) {
    baselines[name] = {
      mean_percentile: value.family_metrics.mean_percentile,
      recall_at_10_percent: value.family_metrics.recall_at_10_percent,
      recall_at_20_percent: value.family_metrics.recall_at_20_percent,
      model_minus_baseline: pairedComparison(validation.family_details, value.family_details, `${variant.seedKey}|${name}`),
    };
  }
  const ablation = {};
  for (const [name, value] of Object.entries(model.mature_feature_ablation.representations)) {
    ablation[name] = {
      mean_percentile: value.family_metrics.mean_percentile,
      recall_at_10_percent: value.family_metrics.recall_at_10_percent,
      recall_at_20_percent: value.family_metrics.recall_at_20_percent,
      mean_percentile_95_ci: value.bootstrap_95_ci.mean_percentile_95_ci,
    };
  }
  const integrated = readCsv(path.join(work, INTEGRATED_CSV)).rows;
  const kept = integrated.filter((row) => referenceCandidates.has(row.mirna));
  if (kept.length !== referenceCandidates.size) throw new Error(`${variant.id}: ${kept.length} dos ${referenceCandidates.size} candidatos de referencia presentes`);
  const number = (row, column) => Number(row[column]);
  const orderBy = (column, tieColumn) => [...kept].sort((left, right) => number(right, column) - number(left, column) || number(left, tieColumn) - number(right, tieColumn) || left.mirna.localeCompare(right.mirna));
  return {
    id: variant.id,
    label: variant.label,
    positives: validation.marker_count,
    seed_families: validation.seed_family_count,
    selected_configuration: model.hyperparameter_selection?.final_configuration?.id ?? null,
    outer_fold_configurations: validation.fold_selections.map((fold) => fold.selected_config),
    model1: {
      mean_percentile: family.mean_percentile,
      mean_percentile_95_ci: validation.bootstrap_95_ci.mean_percentile_95_ci,
      p_value_mean_percentile: validation.random_ranking_test.p_value_mean_percentile,
      recall_at_10_percent: family.recall_at_10_percent,
      recovered_at_10_percent: family.recovered_at_10_percent,
      p_value_recall_at_10_percent: validation.random_ranking_test.p_value_recall_at_10_percent,
      recall_at_20_percent: family.recall_at_20_percent,
      recovered_at_20_percent: family.recovered_at_20_percent,
    },
    baselines,
    feature_ablation: ablation,
    feature_ablation_paired_vs_core: model.mature_feature_ablation.paired_comparisons_against_core,
    candidates_in_variant_list: integrated.length,
    candidates_outside_reference: integrated.length - kept.length,
    orderings: {
      modelo_1: evaluateOrdering(orderBy("score_modelo_sequencial", "rank_modelo_sequencial"), primary, centered, (row) => number(row, "score_modelo_sequencial")),
      integrado_50_50: evaluateOrdering(orderBy("score_final_descoberta", "rank_integrado"), primary, centered, (row) => number(row, "score_final_descoberta")),
      modelo_2: evaluateOrdering(orderBy("score_validacao_pacientes", "rank_validacao_pacientes"), primary, centered, (row) => number(row, "score_validacao_pacientes")),
    },
  };
}

function checkReference(reference) {
  const published = JSON.parse(fs.readFileSync(fromRoot(MODEL1_JSON), "utf8")).internal_recovery_validation;
  const sameModel = Math.abs(published.family_metrics.mean_percentile - reference.model1.mean_percentile) < 1e-12;
  const publishedIntegrated = fs.readFileSync(fromRoot(INTEGRATED_CSV), "utf8");
  const rerunIntegrated = fs.readFileSync(path.join(WORK_ROOT, "referencia_43", INTEGRATED_CSV), "utf8");
  return { model1_mean_percentile_identical: sameModel, integrated_ranking_identical: publishedIntegrated === rerunIntegrated };
}

const pct = (value, digits = 2) => `${(100 * value).toFixed(digits)}%`;
const points = (value, digits = 2) => `${value >= 0 ? "+" : ""}${(100 * value).toFixed(digits)}`;

function writeOutputs(summary) {
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`);

  const text = [];
  text.push("ANALISES DE SENSIBILIDADE POS-HOC — FLUXO DE DESCOBERTA DE miRNAs");
  text.push("Executadas depois dos resultados da coorte externa; nao alteram os artefatos congelados.");
  text.push(`Reproducao da referencia: percentil do Modelo 1 identico=${summary.reference_check.model1_mean_percentile_identical}; lista integrada identica=${summary.reference_check.integrated_ranking_identical}`);
  text.push(`Positivos de fonte unica (${ZOU_ONLY_POSITIVES.length}): ${ZOU_ONLY_POSITIVES.join(", ")}`);
  text.push(`Fonte desses positivos: ${ZOU_2021}. No CSV de positivos eles aparecem com fonte=painel_inicial_do_projeto.`);
  text.push("");
  text.push("1. Modelo 1 com conjuntos positivos alternativos (validacao aninhada por familia de regiao-semente)");
  for (const variant of summary.variants) {
    const m = variant.model1;
    text.push(`${variant.id}\tpositivos=${variant.positives}\tfamilias=${variant.seed_families}\tpercentil_medio=${pct(m.mean_percentile)}\tIC95%=${pct(m.mean_percentile_95_ci[0])} a ${pct(m.mean_percentile_95_ci[1])}\tp=${m.p_value_mean_percentile.toFixed(4)}\trecall@10%=${pct(m.recall_at_10_percent)} (${m.recovered_at_10_percent}/${variant.seed_families})\trecall@20%=${pct(m.recall_at_20_percent)} (${m.recovered_at_20_percent}/${variant.seed_families})`);
  }
  text.push("");
  text.push("2. Modelo 1 menos linha de base, pareado por familia (pontos percentuais de percentil)");
  for (const variant of summary.variants) {
    for (const [name, value] of Object.entries(variant.baselines)) {
      const c = value.model_minus_baseline;
      text.push(`${variant.id}\t${name}\tlinha_de_base=${pct(value.mean_percentile)}\tdiferenca=${points(c.mean_paired_delta)}\tIC95%=${points(c.bootstrap_95_ci[0])} a ${points(c.bootstrap_95_ci[1])}\tp=${c.sign_flip_p_value_two_sided.toFixed(4)}\tfamilias_melhor/pior=${c.families_model_better}/${c.families_model_worse}`);
    }
  }
  text.push("");
  text.push("3. Ablacao de atributos na referencia (mesmos folds externos e hiperparametros)");
  for (const [name, value] of Object.entries(summary.variants[0].feature_ablation)) {
    text.push(`${name}\tpercentil_medio=${pct(value.mean_percentile)}\tIC95%=${pct(value.mean_percentile_95_ci[0])} a ${pct(value.mean_percentile_95_ci[1])}\trecall@10%=${pct(value.recall_at_10_percent)}\trecall@20%=${pct(value.recall_at_20_percent)}`);
  }
  text.push("");
  text.push("4. Reproducao externa por ordenacao, nos mesmos 611 candidatos (reproduzidos/avaliaveis na analise principal; entre colchetes, reproduzidos nas duas analises)");
  for (const variant of summary.variants) {
    for (const [name, value] of Object.entries(variant.orderings)) {
      const cuts = TOP_CUTS.map((cut) => `top${cut}=${value[`top_${cut}`].reproduced_primary}/${value[`top_${cut}`].evaluable} [${value[`top_${cut}`].reproduced_both}]`).join("\t");
      text.push(`${variant.id}\t${name}\t${cuts}\trho_principal=${value.spearman_score_vs_external_auc_primary.toFixed(4)}\trho_centrada=${value.spearman_score_vs_external_auc_centered.toFixed(4)}`);
    }
  }
  text.push("");
  text.push("Observacao: a taxa global de reproducao (255 de 579 na analise principal) nao depende do Modelo 1, porque a direcao esperada de cada candidato vem do Modelo 2 e o teste externo e feito por candidato. As variantes mudam apenas a ordem dos candidatos.");
  fs.writeFileSync(OUT_TXT, `${text.join("\n")}\n`);

  const header = ["variante", "ordenacao", "positivos", "familias", "percentil_medio_modelo1", "ic95_inferior", "ic95_superior", "p_percentil", "recall_10", "recall_20", "top10_reproduzidos", "top10_avaliaveis", "top50_reproduzidos", "top50_avaliaveis", "top100_reproduzidos", "top100_avaliaveis", "spearman_principal", "spearman_centrada"];
  const rows = [header.join(",")];
  for (const variant of summary.variants) {
    for (const [name, value] of Object.entries(variant.orderings)) {
      const m = variant.model1;
      rows.push([variant.id, name, variant.positives, variant.seed_families, m.mean_percentile, m.mean_percentile_95_ci[0], m.mean_percentile_95_ci[1], m.p_value_mean_percentile, m.recall_at_10_percent, m.recall_at_20_percent,
        value.top_10.reproduced_primary, value.top_10.evaluable, value.top_50.reproduced_primary, value.top_50.evaluable, value.top_100.reproduced_primary, value.top_100.evaluable,
        value.spearman_score_vs_external_auc_primary, value.spearman_score_vs_external_auc_centered].map(csvCell).join(","));
    }
  }
  fs.writeFileSync(OUT_CSV, `${rows.join("\n")}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const only = args.find((arg) => arg.startsWith("--only="))?.split("=")[1];
  const force = args.includes("--force");
  const summaryOnly = args.includes("--summary");
  const variants = buildVariants();
  if (only && !variants.some((variant) => variant.id === only)) throw new Error(`Variante desconhecida: ${only}`);

  if (!summaryOnly) {
    for (const variant of variants) {
      if (only && variant.id !== only) continue;
      runVariant(variant, force);
    }
  }
  if (only) return;

  const referenceCandidates = new Set(readCsv(fromRoot(INTEGRATED_CSV)).rows.map((row) => row.mirna));
  const primary = loadExternal(EXTERNAL_PRIMARY);
  const centered = loadExternal(EXTERNAL_CENTERED);
  const summaries = variants.map((variant) => summarizeVariant(variant, referenceCandidates, primary, centered));
  const summary = {
    type: "analise_sensibilidade_pos_hoc",
    warning: "Analises executadas depois de conhecidos os resultados da coorte externa. Nao alteram modelos, listas ou direcoes congelados.",
    design: {
      reference_candidates: referenceCandidates.size,
      external_results: "data/processed/gse73002_ts_external_validation.csv e ..._centered_sensitivity.csv (publicados; nao recalculados)",
      paired_comparison: `diferenca de percentil por familia; bootstrap pareado (${BOOTSTRAP_ITERATIONS}) e inversao de sinais (${SIGN_FLIP_ITERATIONS})`,
      top_cuts: TOP_CUTS,
      single_source_positives: { source: ZOU_2021, label_in_positives_csv: "painel_inicial_do_projeto", markers: ZOU_ONLY_POSITIVES },
    },
    reference_check: checkReference(summaries[0]),
    variants: summaries,
  };
  writeOutputs(summary);
  console.log(fs.readFileSync(OUT_TXT, "utf8"));
}

main();
