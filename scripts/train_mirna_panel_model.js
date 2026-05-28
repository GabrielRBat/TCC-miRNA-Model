const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const INPUT_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const PANEL_CSV = fromRoot("data", "processed", "dataset_mirna_painel_12_disponiveis.csv");
const MODEL_JSON = fromRoot("models", "modelo_mirna_painel.json");
const METRICS_TXT = fromRoot("reports", "modelo_mirna_painel_metricas.txt");
const TEST_RATIO = 0.2;
const SEED = 123;
const EPOCHS = 1200;
const LEARNING_RATE = 0.05;
const L2 = 0.002;

const PANEL = [
  { marker: "let-7b-5p", expected: "downregulated em doente", columns: ["hsa-let-7b"] },
  { marker: "miR-106a-5p", expected: "upregulated em doente", columns: ["hsa-mir-106a"] },
  { marker: "miR-19a-3p", expected: "upregulated em doente", columns: ["hsa-mir-19a"] },
  { marker: "miR-19b-3p", expected: "upregulated em doente", columns: ["hsa-mir-19b-1", "hsa-mir-19b-2"] },
  { marker: "miR-20a-5p", expected: "excecao no compartimento extracelular", columns: ["hsa-mir-20a"] },
  { marker: "miR-223-3p", expected: "excecao no compartimento extracelular", columns: ["hsa-mir-223"] },
  { marker: "miR-25-3p", expected: "upregulated em doente", columns: ["hsa-mir-25"] },
  { marker: "miR-425-5p", expected: "upregulated em doente", columns: ["hsa-mir-425"] },
  { marker: "miR-451a", expected: "upregulated em exossomos", columns: ["hsa-mir-451a"] },
  { marker: "miR-92a-3p", expected: "upregulated em doente", columns: ["hsa-mir-92a-1", "hsa-mir-92a-2"] },
  { marker: "miR-93-5p", expected: "upregulated em doente", columns: ["hsa-mir-93"] },
  { marker: "miR-16-5p", expected: "upregulated em doente", columns: ["hsa-mir-16-1", "hsa-mir-16-2"] },
];

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

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleInPlace(items, rng) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function sigmoid(z) {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

async function buildPanelRows() {
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_CSV),
    crlfDelay: Infinity,
  });

  let header = null;
  let markerSpecs = [];
  const missingMarkers = [];
  const rows = [];
  const out = fs.createWriteStream(PANEL_CSV);

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);

    if (!header) {
      header = cells;
      const indexByColumn = new Map(header.map((name, index) => [name, index]));
      markerSpecs = PANEL.map((item) => {
        const indices = item.columns
          .map((column) => ({ column, index: indexByColumn.get(column) }))
          .filter((entry) => entry.index !== undefined);
        return { ...item, indices };
      });

      for (const item of markerSpecs) {
        if (!item.indices.length) {
          missingMarkers.push(item);
        }
      }

      const availableMarkers = markerSpecs.filter((item) => item.indices.length).map((item) => item.marker);
      out.write(["sample_id", "classe", ...availableMarkers].map(csvCell).join(","));
      out.write("\n");
      continue;
    }

    const sampleId = cells[0];
    const label = Number(cells[1]);
    const values = [];

    for (const item of markerSpecs) {
      if (!item.indices.length) continue;
      const sum = item.indices.reduce((acc, entry) => acc + (Number(cells[entry.index]) || 0), 0);
      values.push(sum / item.indices.length);
    }

    out.write([sampleId, label, ...values].map(csvCell).join(","));
    out.write("\n");
    rows.push({
      sampleId,
      label,
      values: values.map((value) => Math.log1p(Math.max(0, value))),
    });
  }

  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on("error", reject);
  });

  return {
    available: markerSpecs.filter((item) => item.indices.length),
    missing: missingMarkers,
    rows,
  };
}

function stratifiedSplit(rows, testRatio, seed) {
  const rng = makeRandom(seed);
  const byClass = new Map();
  rows.forEach((row, index) => {
    const bucket = byClass.get(row.label) ?? [];
    bucket.push(index);
    byClass.set(row.label, bucket);
  });

  const trainIndices = [];
  const testIndices = [];
  for (const indices of byClass.values()) {
    shuffleInPlace(indices, rng);
    const testCount = Math.round(indices.length * testRatio);
    testIndices.push(...indices.slice(0, testCount));
    trainIndices.push(...indices.slice(testCount));
  }
  shuffleInPlace(trainIndices, rng);
  shuffleInPlace(testIndices, rng);

  return {
    train: trainIndices.map((index) => rows[index]),
    test: testIndices.map((index) => rows[index]),
  };
}

function fitScaler(rows, featureCount) {
  const means = Array(featureCount).fill(0);
  const stds = Array(featureCount).fill(0);

  for (const row of rows) {
    for (let j = 0; j < featureCount; j += 1) means[j] += row.values[j];
  }
  for (let j = 0; j < featureCount; j += 1) means[j] /= rows.length;

  for (const row of rows) {
    for (let j = 0; j < featureCount; j += 1) {
      const diff = row.values[j] - means[j];
      stds[j] += diff * diff;
    }
  }
  for (let j = 0; j < featureCount; j += 1) {
    stds[j] = Math.sqrt(stds[j] / Math.max(1, rows.length - 1)) || 1;
  }

  return { means, stds };
}

function scaleRows(rows, scaler) {
  return rows.map((row) => ({
    ...row,
    values: row.values.map((value, index) => (value - scaler.means[index]) / scaler.stds[index]),
  }));
}

function trainLogisticRegression(rows, featureCount) {
  const weights = Array(featureCount).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    const gradW = Array(featureCount).fill(0);
    let gradB = 0;

    for (const row of rows) {
      let z = bias;
      for (let j = 0; j < featureCount; j += 1) z += weights[j] * row.values[j];
      const error = sigmoid(z) - row.label;
      gradB += error;
      for (let j = 0; j < featureCount; j += 1) gradW[j] += error * row.values[j];
    }

    for (let j = 0; j < featureCount; j += 1) {
      weights[j] -= LEARNING_RATE * (gradW[j] / rows.length + L2 * weights[j]);
    }
    bias -= LEARNING_RATE * (gradB / rows.length);
  }

  return { weights, bias };
}

function predictProbability(model, values) {
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j += 1) z += model.weights[j] * values[j];
  return sigmoid(z);
}

function computeAuc(scored) {
  const sorted = [...scored].sort((a, b) => a.probability - b.probability);
  let rankSumPositive = 0;
  let positives = 0;
  let negatives = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].label === 1) {
      positives += 1;
      rankSumPositive += i + 1;
    } else {
      negatives += 1;
    }
  }

  return (rankSumPositive - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function evaluate(model, rows) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  const scored = [];

  for (const row of rows) {
    const probability = predictProbability(model, row.values);
    const prediction = probability >= 0.5 ? 1 : 0;
    scored.push({ label: row.label, probability });
    if (prediction === 1 && row.label === 1) tp += 1;
    else if (prediction === 0 && row.label === 0) tn += 1;
    else if (prediction === 1 && row.label === 0) fp += 1;
    else fn += 1;
  }

  const accuracy = (tp + tn) / rows.length;
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const specificity = tn / Math.max(1, tn + fp);
  const f1 = (2 * precision * recall) / Math.max(1e-12, precision + recall);
  const auc = computeAuc(scored);
  return { accuracy, precision, recall, specificity, f1, auc, tn, fp, fn, tp };
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

async function main() {
  const { available, missing, rows } = await buildPanelRows();
  const split = stratifiedSplit(rows, TEST_RATIO, SEED);
  const scaler = fitScaler(split.train, available.length);
  const trainRows = scaleRows(split.train, scaler);
  const testRows = scaleRows(split.test, scaler);
  const model = trainLogisticRegression(trainRows, available.length);
  const trainMetrics = evaluate(model, trainRows);
  const testMetrics = evaluate(model, testRows);

  const modelArtifact = {
    type: "logistic_regression_binary_panel",
    positive_class: "1 = doente",
    negative_class: "0 = saudavel",
    source_dataset: INPUT_CSV,
    panel_dataset: PANEL_CSV,
    transform: "mean across mapped precursor columns, then log1p, then training-set standardization",
    markers: available.map((item, index) => ({
      marker: item.marker,
      expected: item.expected,
      source_columns: item.indices.map((entry) => entry.column),
      mean: scaler.means[index],
      std: scaler.stds[index],
      weight: model.weights[index],
    })),
    missing_markers: missing.map((item) => ({
      marker: item.marker,
      expected: item.expected,
      desired_columns: item.columns,
    })),
    bias: model.bias,
    threshold: 0.5,
  };
  await fs.promises.writeFile(MODEL_JSON, JSON.stringify(modelArtifact, null, 2), "utf8");

  const markerWeights = available
    .map((item, index) => ({ marker: item.marker, expected: item.expected, weight: model.weights[index] }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const report = [
    `Dataset base: ${INPUT_CSV}`,
    `Dataset do painel gerado: ${PANEL_CSV}`,
    `Amostras totais: ${rows.length}`,
    `Marcadores solicitados: ${PANEL.length}`,
    `Marcadores usados: ${available.length}`,
    `Marcadores ausentes: ${missing.length}`,
    `Treino: ${split.train.length}`,
    `Teste: ${split.test.length}`,
    "",
    "Marcadores usados e colunas fonte:",
    ...available.map((item) => `${item.marker}\t${item.indices.map((entry) => entry.column).join(", ")}\t${item.expected}`),
    "",
    "Marcadores ausentes na versao com colunas comuns:",
    ...(missing.length
      ? missing.map((item) => `${item.marker}\tcolunas desejadas: ${item.columns.join(", ")}`)
      : ["nenhum"]),
    "",
    "Metricas no treino:",
    `accuracy=${percent(trainMetrics.accuracy)}`,
    `precision=${percent(trainMetrics.precision)}`,
    `recall/sensibilidade=${percent(trainMetrics.recall)}`,
    `specificity=${percent(trainMetrics.specificity)}`,
    `f1=${percent(trainMetrics.f1)}`,
    `auc=${trainMetrics.auc.toFixed(4)}`,
    `confusion_matrix tn=${trainMetrics.tn} fp=${trainMetrics.fp} fn=${trainMetrics.fn} tp=${trainMetrics.tp}`,
    "",
    "Metricas no teste:",
    `accuracy=${percent(testMetrics.accuracy)}`,
    `precision=${percent(testMetrics.precision)}`,
    `recall/sensibilidade=${percent(testMetrics.recall)}`,
    `specificity=${percent(testMetrics.specificity)}`,
    `f1=${percent(testMetrics.f1)}`,
    `auc=${testMetrics.auc.toFixed(4)}`,
    `confusion_matrix tn=${testMetrics.tn} fp=${testMetrics.fp} fn=${testMetrics.fn} tp=${testMetrics.tp}`,
    "",
    "Pesos aprendidos, positivo puxa para doente e negativo puxa para saudavel:",
    ...markerWeights.map((item) => `${item.marker}\t${item.weight.toFixed(6)}\t${item.expected}`),
    "",
    "Nota: usar apenas os marcadores disponiveis e biologicamente relevantes reduz ruido, mas ainda existe risco de vies de lote/fonte entre doentes e saudaveis.",
    "",
  ].join("\n");

  await fs.promises.writeFile(METRICS_TXT, report, "utf8");
  console.log(report);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
