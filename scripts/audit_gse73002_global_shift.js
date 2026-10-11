const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "data", "processed", "gse73002_external_validation_ts.csv");
const OUTPUT_JSON = path.join(ROOT, "reports", "gse73002_global_shift_audit.json");
const OUTPUT_TXT = path.join(ROOT, "reports", "gse73002_global_shift_audit.txt");

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function auc(positives, negatives) {
  const scored = [...positives.map((value) => ({ value, label: 1 })), ...negatives.map((value) => ({ value, label: 0 }))].sort((left, right) => left.value - right.value);
  let rankSum = 0;
  for (let index = 0; index < scored.length;) {
    let end = index + 1;
    while (end < scored.length && scored[end].value === scored[index].value) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) if (scored[cursor].label === 1) rankSum += averageRank;
    index = end;
  }
  return (rankSum - positives.length * (positives.length + 1) / 2) / (positives.length * negatives.length);
}

function main() {
  const lines = fs.readFileSync(INPUT, "utf8").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const featureCount = header.length - 2;
  const diseaseSums = new Float64Array(featureCount);
  const controlSums = new Float64Array(featureCount);
  const diseaseSampleMeans = [];
  const controlSampleMeans = [];
  let diseaseCount = 0;
  let controlCount = 0;
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const cells = lines[rowIndex].split(",");
    if (cells.length !== header.length) throw new Error(`Linha ${rowIndex + 1} invalida`);
    const label = Number(cells[1]);
    let rowSum = 0;
    for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
      const value = Number(cells[featureIndex + 2]);
      if (!Number.isFinite(value)) throw new Error(`Valor invalido na linha ${rowIndex + 1}, coluna ${featureIndex + 3}`);
      rowSum += value;
      (label === 1 ? diseaseSums : controlSums)[featureIndex] += value;
    }
    (label === 1 ? diseaseSampleMeans : controlSampleMeans).push(rowSum / featureCount);
    if (label === 1) diseaseCount += 1;
    else if (label === 0) controlCount += 1;
    else throw new Error(`Classe invalida na linha ${rowIndex + 1}`);
  }
  const featureDifferences = Array.from(diseaseSums, (sum, index) => sum / diseaseCount - controlSums[index] / controlCount);
  const higherCount = featureDifferences.filter((value) => value > 0).length;
  const lowerCount = featureDifferences.filter((value) => value < 0).length;
  const summary = {
    input: path.relative(ROOT, INPUT).split(path.sep).join("/"),
    samples: { total: diseaseCount + controlCount, breastCancer: diseaseCount, nonCancerControls: controlCount },
    mirnaColumns: featureCount,
    globalSampleMean: {
      breastCancer: mean(diseaseSampleMeans),
      nonCancerControls: mean(controlSampleMeans),
      difference: mean(diseaseSampleMeans) - mean(controlSampleMeans),
      aucCancerHigher: auc(diseaseSampleMeans, controlSampleMeans),
    },
    featureMeanDirection: {
      higherInCancer: higherCount,
      lowerInCancer: lowerCount,
      equal: featureCount - higherCount - lowerCount,
      proportionHigherInCancer: higherCount / featureCount,
      differenceQuantiles: {
        minimum: quantile(featureDifferences, 0),
        p05: quantile(featureDifferences, 0.05),
        p25: quantile(featureDifferences, 0.25),
        median: quantile(featureDifferences, 0.5),
        p75: quantile(featureDifferences, 0.75),
        p95: quantile(featureDifferences, 0.95),
        maximum: quantile(featureDifferences, 1),
      },
    },
    interpretation: "AUC global alta ou predominio quase universal da mesma direcao indica deslocamento de intensidade/coorte e exige sensibilidade centrada por amostra; nao prova que todos os miRNAs sejam biomarcadores.",
  };
  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const report = [
    "Auditoria de deslocamento global - GSE73002 TS", "",
    `Amostras: ${summary.samples.total} (cancer=${diseaseCount}; controles=${controlCount})`,
    `Colunas de miRNA: ${featureCount}`,
    `Media global por amostra - cancer: ${summary.globalSampleMean.breastCancer.toFixed(6)}`,
    `Media global por amostra - controles: ${summary.globalSampleMean.nonCancerControls.toFixed(6)}`,
    `Diferenca global: ${summary.globalSampleMean.difference.toFixed(6)}`,
    `AUC da media global da amostra: ${summary.globalSampleMean.aucCancerHigher.toFixed(6)}`,
    `miRNAs com media maior no cancer: ${higherCount}/${featureCount} (${(100 * higherCount / featureCount).toFixed(2)}%)`,
    `miRNAs com media menor no cancer: ${lowerCount}/${featureCount} (${(100 * lowerCount / featureCount).toFixed(2)}%)`,
    `Mediana das diferencas por miRNA: ${summary.featureMeanDirection.differenceQuantiles.median.toFixed(6)}`, "",
    summary.interpretation, "",
  ].join("\n");
  fs.writeFileSync(OUTPUT_TXT, report, "utf8");
  console.log(report);
}

main();
