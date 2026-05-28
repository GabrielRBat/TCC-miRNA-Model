const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const DATASET_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const MODEL_JSON = fromRoot("models", "modelo_mirna_logistic.json");
const METRICS_TXT = fromRoot("reports", "modelo_mirna_metricas.txt");
const TEST_RATIO = 0.2;
const SEED = 42;
const EPOCHS = 1800;
const LEARNING_RATE = 0.035;
const L2 = 0.001;

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

async function loadDataset(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let features = [];
  const rows = [];
  let isHeader = true;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (isHeader) {
      features = cells.slice(2);
      isHeader = false;
      continue;
    }

    const sampleId = cells[0];
    const label = Number(cells[1]);
    const values = cells.slice(2).map((value) => Math.log1p(Math.max(0, Number(value) || 0)));
    rows.push({ sampleId, label, values });
  }

  return { features, rows };
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
    for (let j = 0; j < featureCount; j += 1) {
      means[j] += row.values[j];
    }
  }
  for (let j = 0; j < featureCount; j += 1) {
    means[j] /= rows.length;
  }

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
    sampleId: row.sampleId,
    label: row.label,
    values: row.values.map((value, j) => (value - scaler.means[j]) / scaler.stds[j]),
  }));
}

function trainLogisticRegression(rows, featureCount) {
  const weights = Array(featureCount).fill(0);
  let bias = 0;
  let lastLoss = Infinity;

  for (let epoch = 1; epoch <= EPOCHS; epoch += 1) {
    const gradW = Array(featureCount).fill(0);
    let gradB = 0;
    let loss = 0;

    for (const row of rows) {
      let z = bias;
      for (let j = 0; j < featureCount; j += 1) {
        z += weights[j] * row.values[j];
      }

      const p = sigmoid(z);
      const error = p - row.label;
      gradB += error;
      loss += -(row.label * Math.log(p + 1e-12) + (1 - row.label) * Math.log(1 - p + 1e-12));

      for (let j = 0; j < featureCount; j += 1) {
        gradW[j] += error * row.values[j];
      }
    }

    const n = rows.length;
    for (let j = 0; j < featureCount; j += 1) {
      gradW[j] = gradW[j] / n + L2 * weights[j];
      weights[j] -= LEARNING_RATE * gradW[j];
    }
    bias -= LEARNING_RATE * (gradB / n);
    lastLoss = loss / n + 0.5 * L2 * weights.reduce((sum, w) => sum + w * w, 0);
  }

  return { weights, bias, loss: lastLoss };
}

function predictProbability(model, values) {
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j += 1) {
    z += model.weights[j] * values[j];
  }
  return sigmoid(z);
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
    else if (prediction === 0 && row.label === 1) fn += 1;
  }

  const accuracy = (tp + tn) / rows.length;
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const specificity = tn / Math.max(1, tn + fp);
  const f1 = (2 * precision * recall) / Math.max(1e-12, precision + recall);
  const auc = computeAuc(scored);

  return { accuracy, precision, recall, specificity, f1, auc, tp, tn, fp, fn };
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

  if (!positives || !negatives) return NaN;
  return (rankSumPositive - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function formatPercent(value) {
  return `${(100 * value).toFixed(2)}%`;
}

function topFeatures(features, weights) {
  return features
    .map((feature, index) => ({ feature, weight: weights[index], absWeight: Math.abs(weights[index]) }))
    .sort((a, b) => b.absWeight - a.absWeight);
}

async function main() {
  const { features, rows } = await loadDataset(DATASET_CSV);
  const { train, test } = stratifiedSplit(rows, TEST_RATIO, SEED);
  const scaler = fitScaler(train, features.length);
  const trainScaled = scaleRows(train, scaler);
  const testScaled = scaleRows(test, scaler);
  const model = trainLogisticRegression(trainScaled, features.length);
  const trainMetrics = evaluate(model, trainScaled);
  const testMetrics = evaluate(model, testScaled);
  const rankedFeatures = topFeatures(features, model.weights);

  const modelArtifact = {
    type: "logistic_regression_binary",
    positive_class: "1 = doente",
    negative_class: "0 = saudavel",
    source_dataset: DATASET_CSV,
    transform: "log1p(max(value, 0)) followed by standardization using training-set mean/std",
    seed: SEED,
    threshold: 0.5,
    features,
    means: scaler.means,
    stds: scaler.stds,
    weights: model.weights,
    bias: model.bias,
  };
  await fs.promises.writeFile(MODEL_JSON, JSON.stringify(modelArtifact, null, 2), "utf8");

  const report = [
    `Dataset: ${DATASET_CSV}`,
    `Amostras totais: ${rows.length}`,
    `Features usadas: ${features.length}`,
    `Treino: ${train.length}`,
    `Teste: ${test.length}`,
    `Classe positiva: 1 = doente`,
    `Classe negativa: 0 = saudavel`,
    "",
    "Metricas no treino:",
    `accuracy=${formatPercent(trainMetrics.accuracy)}`,
    `precision=${formatPercent(trainMetrics.precision)}`,
    `recall/sensibilidade=${formatPercent(trainMetrics.recall)}`,
    `specificity=${formatPercent(trainMetrics.specificity)}`,
    `f1=${formatPercent(trainMetrics.f1)}`,
    `auc=${trainMetrics.auc.toFixed(4)}`,
    `confusion_matrix tn=${trainMetrics.tn} fp=${trainMetrics.fp} fn=${trainMetrics.fn} tp=${trainMetrics.tp}`,
    "",
    "Metricas no teste:",
    `accuracy=${formatPercent(testMetrics.accuracy)}`,
    `precision=${formatPercent(testMetrics.precision)}`,
    `recall/sensibilidade=${formatPercent(testMetrics.recall)}`,
    `specificity=${formatPercent(testMetrics.specificity)}`,
    `f1=${formatPercent(testMetrics.f1)}`,
    `auc=${testMetrics.auc.toFixed(4)}`,
    `confusion_matrix tn=${testMetrics.tn} fp=${testMetrics.fp} fn=${testMetrics.fn} tp=${testMetrics.tp}`,
    "",
    "Top 20 miRNAs que mais puxam para doente, pelo peso positivo:",
    ...rankedFeatures
      .filter((item) => item.weight > 0)
      .slice(0, 20)
      .map((item) => `${item.feature}\t${item.weight.toFixed(6)}`),
    "",
    "Top 20 miRNAs que mais puxam para saudavel, pelo peso negativo:",
    ...rankedFeatures
      .filter((item) => item.weight < 0)
      .slice(0, 20)
      .map((item) => `${item.feature}\t${item.weight.toFixed(6)}`),
    "",
    "Nota: este e um baseline. Como doentes e saudaveis vieram de fontes diferentes, metricas altas podem refletir diferenca de lote/fonte, nao necessariamente sinal biologico da doenca.",
    "",
  ].join("\n");

  await fs.promises.writeFile(METRICS_TXT, report, "utf8");
  console.log(report);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
