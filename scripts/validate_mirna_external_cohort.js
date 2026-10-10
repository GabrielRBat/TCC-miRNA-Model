const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const INTERNAL_DATASET = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const INTEGRATED_RANKING = fromRoot("data", "processed", "mirna_patient_candidate_integrated_ranking.csv");
const OUTPUT_CSV = fromRoot("data", "processed", "mirna_external_cohort_validation.csv");
const OUTPUT_REPORT = fromRoot("reports", "mirna_external_cohort_validation_report.txt");
const MIN_EXTERNAL_SAMPLES_PER_CLASS = 10;
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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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
  const variance = (varianceAuc * (1 - varianceAuc) + (positiveCount - 1) * (q1 - varianceAuc * varianceAuc) + (negativeCount - 1) * (q2 - varianceAuc * varianceAuc)) / pairCount;
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

function main() {
  const input = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!input) throw new Error("Uso: node scripts/validate_mirna_external_cohort.js caminho/da/coorte.csv");
  for (const required of [input, INTERNAL_DATASET, INTEGRATED_RANKING]) if (!fs.existsSync(required)) throw new Error(`Arquivo nao encontrado: ${required}`);

  const external = readCsv(input);
  const internal = readCsv(INTERNAL_DATASET);
  const ranking = readCsv(INTEGRATED_RANKING);
  for (const column of ["sample_id", "classe"]) if (!external.indexByName.has(column)) throw new Error(`Coluna obrigatoria ausente na coorte externa: ${column}`);
  const sampleIdIndex = external.indexByName.get("sample_id");
  const classIndex = external.indexByName.get("classe");
  const sampleIds = external.rows.map((row) => row[sampleIdIndex]?.trim());
  if (sampleIds.some((value) => !value)) throw new Error("A coorte externa possui sample_id vazio");
  if (new Set(sampleIds).size !== sampleIds.length) throw new Error("A coorte externa possui sample_id duplicado");
  const labels = external.rows.map((row) => Number(row[classIndex]));
  if (labels.some((value) => ![0, 1].includes(value)) || !labels.includes(0) || !labels.includes(1)) throw new Error("A coluna classe deve conter 0 e 1");
  if (labels.filter((value) => value === 0).length < 2 || labels.filter((value) => value === 1).length < 2) throw new Error("A coorte externa precisa de pelo menos duas amostras em cada classe");

  const internalSampleIdIndex = internal.indexByName.get("sample_id");
  if (internalSampleIdIndex === undefined) throw new Error("A base interna nao possui sample_id para conferir independencia");
  const normalizedSampleId = (value) => String(value ?? "").trim().toLowerCase();
  const internalIds = new Set(internal.rows.map((row) => normalizedSampleId(row[internalSampleIdIndex])).filter(Boolean));
  const overlappingIds = sampleIds.filter((id) => internalIds.has(normalizedSampleId(id)));
  if (overlappingIds.length) throw new Error(`Coorte nao independente: ${overlappingIds.length} sample_id tambem aparecem na base interna`);

  const expressionHeaders = external.header.filter((name) => !["sample_id", "classe"].includes(name));
  const diseaseCount = labels.filter((value) => value === 1).length;
  const healthyCount = labels.filter((value) => value === 0).length;
  const minimumSampleSizeMet = diseaseCount >= MIN_EXTERNAL_SAMPLES_PER_CLASS && healthyCount >= MIN_EXTERNAL_SAMPLES_PER_CLASS;
  const exactHeaders = new Map();
  const familyHeaders = new Map();
  for (const header of expressionHeaders) {
    const normalized = normalizeMirna(header);
    if (!normalized) throw new Error(`Cabecalho de expressao vazio ou invalido: ${header}`);
    if (exactHeaders.has(normalized)) throw new Error(`Colunas de expressao duplicadas apos normalizacao do nome: ${exactHeaders.get(normalized)[0]} e ${header}`);
    const exact = exactHeaders.get(normalized) ?? [];
    exact.push(header);
    exactHeaders.set(normalized, exact);
    const family = matureFamily(normalized);
    const related = familyHeaders.get(family) ?? [];
    related.push(header);
    familyHeaders.set(family, related);
  }

  const results = [];
  for (const row of ranking.rows) {
    const get = (name) => row[ranking.indexByName.get(name)] ?? "";
    const mirna = get("mirna");
    const exact = exactHeaders.get(normalizeMirna(mirna)) ?? [];
    const features = exact.length ? exact : (familyHeaders.get(matureFamily(mirna)) ?? []);
    if (!features.length) continue;
    const resolution = exact.length ? "miRNA_maduro_exato" : "proxy_familia_precursor";
    const values = external.rows.map((sample, sampleIndex) => mean(features.map((feature) => {
      const raw = sample[external.indexByName.get(feature)];
      const value = Number(raw);
      if (String(raw ?? "").trim() === "" || !Number.isFinite(value) || value < 0) throw new Error(`Expressao invalida em sample_id=${sampleIds[sampleIndex]}, feature=${feature}: ${raw}`);
      return value;
    })));
    const disease = values.filter((value, index) => labels[index] === 1);
    const healthy = values.filter((value, index) => labels[index] === 0);
    const diseaseLog = disease.map((value) => Math.log1p(Math.max(0, value)));
    const healthyLog = healthy.map((value) => Math.log1p(Math.max(0, value)));
    const rawAuc = computeAuc(diseaseLog, healthyLog);
    const expectedHigher = get("direcao_aprendida_no_paciente") !== "menor_expressao_puxa_para_doente";
    const directionalAuc = expectedHigher ? rawAuc : 1 - rawAuc;
    const log2FoldChange = Math.log2((mean(disease) + 1) / (mean(healthy) + 1));
    const directionConcordant = expectedHigher ? log2FoldChange > 0 : log2FoldChange < 0;
    const confidenceInterval = aucConfidenceInterval(directionalAuc, disease.length, healthy.length);
    const pValue = aucPValue(directionalAuc, disease.length, healthy.length);
    results.push({
      mirna,
      internalRank: Number(get("rank_integrado")),
      features,
      resolution,
      expectedDirection: get("direcao_aprendida_no_paciente"),
      directionConcordant,
      directionalAuc,
      confidenceInterval,
      pValue,
      rawAuc,
      log2FoldChange,
      diseaseMean: mean(disease),
      healthyMean: mean(healthy),
      diseaseMedian: median(disease),
      healthyMedian: median(healthy),
    });
  }
  const hypothesesByKey = new Map();
  for (const item of results) {
    const key = `${[...item.features].sort().join("|")}|${item.expectedDirection}`;
    item.hypothesisKey = key;
    if (!hypothesesByKey.has(key)) hypothesesByKey.set(key, { key, pValue: item.pValue, fdrBh: 1 });
  }
  benjaminiHochberg([...hypothesesByKey.values()]);
  for (const item of results) {
    item.fdrBh = hypothesesByKey.get(item.hypothesisKey).fdrBh;
    item.replicatedSignal = minimumSampleSizeMet && item.directionConcordant && item.confidenceInterval[0] > 0.5 && item.fdrBh < 0.05;
    item.replicatedExact = item.replicatedSignal && item.resolution === "miRNA_maduro_exato";
  }
  results.sort((left, right) => Number(right.replicatedExact) - Number(left.replicatedExact) || Number(right.replicatedSignal) - Number(left.replicatedSignal) || right.directionalAuc - left.directionalAuc || left.internalRank - right.internalRank);

  const header = ["rank_externo", "mirna", "rank_integrado_interno", "features_externas", "resolucao_mapeamento", "direcao_interna_esperada", "direcao_concordante", "auc_externa_direcional", "auc_externa_ic95_inferior", "auc_externa_ic95_superior", "auc_externa_p_gt_0_5_unilateral_aprox", "auc_externa_fdr_bh_aprox", "auc_externa_bruta", "log2_fc_externo", "media_doente_externa", "media_saudavel_externa", "mediana_doente_externa", "mediana_saudavel_externa", "minimo_10_amostras_por_classe", "sinal_reproduzido_com_fdr", "replicacao_madura_exata"];
  const rows = results.map((item, index) => [index + 1, item.mirna, item.internalRank, item.features.join("; "), item.resolution, item.expectedDirection, item.directionConcordant ? "sim" : "nao", item.directionalAuc.toFixed(6), item.confidenceInterval[0].toFixed(6), item.confidenceInterval[1].toFixed(6), item.pValue.toExponential(6), item.fdrBh.toExponential(6), item.rawAuc.toFixed(6), item.log2FoldChange.toFixed(6), item.diseaseMean.toFixed(6), item.healthyMean.toFixed(6), item.diseaseMedian.toFixed(6), item.healthyMedian.toFixed(6), minimumSampleSizeMet ? "sim" : "nao", item.replicatedSignal ? "sim" : "nao", item.replicatedExact ? "sim" : "nao"]);
  fs.mkdirSync(path.dirname(OUTPUT_CSV), { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_REPORT), { recursive: true });
  fs.writeFileSync(OUTPUT_CSV, [header, ...rows].map((item) => item.map(csvCell).join(",")).join("\n"), "utf8");

  const report = [
    "Validacao em coorte externa independente", "",
    `Entrada: ${path.relative(ROOT, input).split(path.sep).join("/")}`,
    `Amostras: ${external.rows.length}`,
    `Doentes: ${diseaseCount}`,
    `Saudaveis: ${healthyCount}`,
    `Piso tecnico de ${MIN_EXTERNAL_SAMPLES_PER_CLASS} amostras por classe atendido: ${minimumSampleSizeMet ? "sim" : "nao"}`,
    `Sobreposicao de sample_id com a coorte interna: ${overlappingIds.length}`,
    `Candidatos com expressao encontrada: ${results.length}`,
    `Mapeamento maduro exato: ${results.filter((item) => item.resolution === "miRNA_maduro_exato").length}`,
    `Mapeamento por proxy de familia: ${results.filter((item) => item.resolution !== "miRNA_maduro_exato").length}`,
    `Hipoteses externas distintas submetidas a FDR BH: ${hypothesesByKey.size}`,
    `Direcao concordante: ${results.filter((item) => item.directionConcordant).length}`,
    `Sinais reproduzidos (piso amostral, direcao concordante, limite inferior do IC95% > 0.5 e FDR BH < 0.05): ${results.filter((item) => item.replicatedSignal).length}`,
    `Replicacoes com miRNA maduro exato: ${results.filter((item) => item.replicatedExact).length}`, "",
    "Top resultados externos:",
    ...results.slice(0, 30).map((item, index) => `${index + 1}. ${item.mirna}\tauc=${item.directionalAuc.toFixed(3)}\tIC95%=${item.confidenceInterval.map((value) => value.toFixed(3)).join(" a ")}\tFDR=${item.fdrBh.toExponential(2)}\tlog2FC=${item.log2FoldChange.toFixed(3)}\tconcordante=${item.directionConcordant ? "sim" : "nao"}\tresolucao=${item.resolution}`), "",
    "Avisos:",
    "O script nao retreina nem escolhe candidatos na coorte externa; aplica o ranking e a direcao congelados.",
    "Mapeamento por familia/precursor nao distingue 5p de 3p e deve ser apresentado separadamente do mapeamento maduro exato.",
    `O criterio de reproducao exige ao menos ${MIN_EXTERNAL_SAMPLES_PER_CLASS} amostras por classe, direcao concordante, limite inferior do IC95% da AUC acima de 0.5 e FDR BH abaixo de 0.05; o p e unilateral para AUC direcional > 0.5, IC e p sao aproximacoes assintoticas, valores no piso significam p<1e-16 e o IC estabiliza AUCs na fronteira 0/1 com meio par concordante.`,
    "Replicacao computacional externa fortalece a evidencia, mas nao substitui validacao laboratorial.", "",
  ].join("\n");
  fs.writeFileSync(OUTPUT_REPORT, report, "utf8");
  console.log(report);
}

main();
