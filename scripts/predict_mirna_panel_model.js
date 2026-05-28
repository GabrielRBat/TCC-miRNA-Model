const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const MODEL_JSON = fromRoot("models", "modelo_mirna_painel.json");
const INPUT_CSV = process.argv[2];
const OUTPUT_CSV = process.argv[3] || fromRoot("predictions", "predicoes_mirna_painel.csv");

if (!INPUT_CSV) {
  console.error("Uso: node predict_mirna_panel_model.js arquivo_de_amostras.csv [saida.csv]");
  process.exit(1);
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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sigmoid(z) {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

async function main() {
  const model = JSON.parse(await fs.promises.readFile(MODEL_JSON, "utf8"));
  const out = fs.createWriteStream(OUTPUT_CSV);
  out.write(["sample_id", "probabilidade_doente", "classe_predita"].join(","));
  out.write("\n");

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_CSV),
    crlfDelay: Infinity,
  });

  let header = null;
  let markerIndices = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);

    if (!header) {
      header = cells;
      const indexByColumn = new Map(header.map((name, index) => [name, index]));
      markerIndices = model.markers.map((marker) => {
        const indices = marker.source_columns
          .map((column) => indexByColumn.get(column))
          .filter((index) => index !== undefined);
        if (!indices.length) {
          throw new Error(`Nenhuma coluna encontrada para o marcador ${marker.marker}`);
        }
        return indices;
      });
      continue;
    }

    const values = markerIndices.map((indices, markerIndex) => {
      const meanRaw =
        indices.reduce((sum, index) => sum + (Number(cells[index]) || 0), 0) / indices.length;
      const logged = Math.log1p(Math.max(0, meanRaw));
      const marker = model.markers[markerIndex];
      return (logged - marker.mean) / marker.std;
    });

    let z = model.bias;
    for (let i = 0; i < model.markers.length; i += 1) {
      z += model.markers[i].weight * values[i];
    }

    const probability = sigmoid(z);
    const prediction = probability >= model.threshold ? 1 : 0;
    out.write([cells[0], probability.toFixed(6), prediction].map(csvCell).join(","));
    out.write("\n");
  }

  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on("error", reject);
  });

  console.log(`Predicoes geradas em: ${OUTPUT_CSV}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
