const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const SICK_CSV = fromRoot("data", "raw", "dataset_mirna_raw (doentes).csv");
const HEALTHY_TXT = fromRoot("data", "raw", "miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).txt");
const MAPPING_TSV = fromRoot("data", "external", "rnacentral_mirbase_mapping.tsv");
const OUTPUT_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado.csv");
const COMMON_OUTPUT_CSV = fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv");
const REPORT_TXT = fromRoot("reports", "dataset_mirna_balanceado_report.txt");
const TARGET_HEALTHY = 1339;
const HEALTHY_CLASS = "0";
const HUMAN_TAXID = "9606";

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

async function readFirstLine(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    rl.close();
    return line;
  }

  throw new Error(`Arquivo vazio: ${filePath}`);
}

async function countCsvRowsAndClasses(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let rowCount = 0;
  const classCounts = new Map();
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;
    rowCount += 1;
    const fields = parseCsvLine(line);
    const cls = fields[1] ?? "";
    classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
  }

  return { rowCount, classCounts };
}

function normalizeMirnaName(name) {
  return name.toLowerCase().replace("hsa-mir-", "hsa-mir-");
}

function matureToBaseName(name) {
  return normalizeMirnaName(name)
    .replace(/-[35]p$/, "")
    .replace(/-\d+p$/, "");
}

function precursorToBaseName(name) {
  return normalizeMirnaName(name).replace(/-\d+$/, "");
}

async function buildMirbaseMaps(requiredFeatures) {
  const required = new Set(requiredFeatures.map((feature) => feature.toLowerCase()));
  const featureToPreUrn = new Map();
  const urnToMatureNames = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(MAPPING_TSV),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 6) continue;

    const [urs, , , taxid, type, name] = parts;
    const normalizedName = name.toLowerCase();
    if (taxid !== HUMAN_TAXID) continue;
    if (type === "pre_miRNA" && required.has(normalizedName) && !featureToPreUrn.has(normalizedName)) {
      featureToPreUrn.set(normalizedName, urs);
    } else if (type === "miRNA" && normalizedName.startsWith("hsa-")) {
      const names = urnToMatureNames.get(urs) ?? [];
      names.push(normalizedName);
      urnToMatureNames.set(urs, names);
    }
  }

  return { featureToPreUrn, urnToMatureNames };
}

function addNumericVectors(target, source) {
  for (let i = 0; i < source.length; i += 1) {
    target[i] = String((Number(target[i]) || 0) + (Number(source[i]) || 0));
  }
}

async function readHealthyMatrix(urnToMatureNames, outputFeatures) {
  const baseToFeatures = new Map();
  for (const feature of outputFeatures) {
    const bases = new Set([normalizeMirnaName(feature), precursorToBaseName(feature)]);
    for (const base of bases) {
      const features = baseToFeatures.get(base) ?? [];
      features.push(feature);
      baseToFeatures.set(base, features);
    }
  }

  const featureValues = new Map();
  const featureMatchedBy = new Map();
  let sampleIds = [];
  let lineNumber = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(HEALTHY_TXT),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNumber += 1;
    const parts = line.split("\t");

    if (lineNumber === 1) {
      sampleIds = parts.slice(1, TARGET_HEALTHY + 1);
      if (sampleIds.length < TARGET_HEALTHY) {
        throw new Error(
          `O TXT tem somente ${sampleIds.length} amostras saudaveis, menos que ${TARGET_HEALTHY}.`
        );
      }
      continue;
    }

    const urn = parts[0];
    const matureNames = urnToMatureNames.get(urn);
    if (!matureNames) continue;

    const values = parts.slice(1, TARGET_HEALTHY + 1);
    if (values.length !== TARGET_HEALTHY) {
      throw new Error(`Linha ${lineNumber} do TXT tem quantidade inesperada de colunas.`);
    }

    const targetFeatures = new Set();
    for (const matureName of matureNames) {
      const base = matureToBaseName(matureName);
      const features = baseToFeatures.get(base);
      if (!features) continue;
      for (const feature of features) {
        targetFeatures.add(feature);
        const matchedBy = featureMatchedBy.get(feature) ?? new Set();
        matchedBy.add(matureName);
        featureMatchedBy.set(feature, matchedBy);
      }
    }

    for (const feature of targetFeatures) {
      if (!featureValues.has(feature)) {
        featureValues.set(feature, Array(TARGET_HEALTHY).fill("0"));
      }
      addNumericVectors(featureValues.get(feature), values);
    }
  }

  return { sampleIds, featureValues, featureMatchedBy };
}

async function writeOutput(header, outputFeatures, sampleIds, featureValues) {
  await fs.promises.copyFile(SICK_CSV, OUTPUT_CSV);

  const appendStream = fs.createWriteStream(OUTPUT_CSV, { flags: "a" });
  appendStream.write("\n");

  for (let sampleIndex = 0; sampleIndex < TARGET_HEALTHY; sampleIndex += 1) {
    const row = [sampleIds[sampleIndex], HEALTHY_CLASS];
    for (const feature of outputFeatures) {
      const values = featureValues.get(feature);
      row.push(values ? values[sampleIndex] : "0");
    }
    appendStream.write(row.map(csvCell).join(","));
    appendStream.write(sampleIndex === TARGET_HEALTHY - 1 ? "" : "\n");
  }

  await new Promise((resolve, reject) => {
    appendStream.end(resolve);
    appendStream.on("error", reject);
  });
}

async function writeCommonOutput(header, outputFeatures, sampleIds, featureValues) {
  const matchedFeatures = outputFeatures.filter((feature) => featureValues.has(feature));
  const matchedFeatureSet = new Set(matchedFeatures);
  const selectedIndices = [0, 1];
  for (let i = 0; i < outputFeatures.length; i += 1) {
    if (matchedFeatureSet.has(outputFeatures[i])) {
      selectedIndices.push(i + 2);
    }
  }

  const out = fs.createWriteStream(COMMON_OUTPUT_CSV);
  out.write(["sample_id", "classe", ...matchedFeatures].map(csvCell).join(","));
  out.write("\n");

  const rl = readline.createInterface({
    input: fs.createReadStream(SICK_CSV),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    out.write(selectedIndices.map((index) => csvCell(fields[index] ?? "0")).join(","));
    out.write("\n");
  }

  for (let sampleIndex = 0; sampleIndex < TARGET_HEALTHY; sampleIndex += 1) {
    const row = [sampleIds[sampleIndex], HEALTHY_CLASS];
    for (const feature of matchedFeatures) {
      row.push(featureValues.get(feature)[sampleIndex]);
    }
    out.write(row.map(csvCell).join(","));
    out.write(sampleIndex === TARGET_HEALTHY - 1 ? "" : "\n");
  }

  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on("error", reject);
  });

  return matchedFeatures.length;
}

function formatClassCounts(classCounts) {
  return [...classCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key || "(vazio)"}=${value}`)
    .join(", ");
}

async function main() {
  const headerLine = await readFirstLine(SICK_CSV);
  const header = parseCsvLine(headerLine);
  if (header.length < 3 || header[0] !== "sample_id" || header[1] !== "classe") {
    throw new Error("O CSV de doentes nao tem o cabecalho esperado: sample_id,classe,...");
  }

  const outputFeatures = header.slice(2);
  const sickSummary = await countCsvRowsAndClasses(SICK_CSV);
  const { featureToPreUrn, urnToMatureNames } = await buildMirbaseMaps(outputFeatures);
  const { sampleIds, featureValues, featureMatchedBy } = await readHealthyMatrix(
    urnToMatureNames,
    outputFeatures
  );

  const missingMapping = outputFeatures.filter((feature) => !featureToPreUrn.has(feature.toLowerCase()));
  const missingInHealthyTxt = outputFeatures.filter((feature) => !featureValues.has(feature));

  await writeOutput(header, outputFeatures, sampleIds, featureValues);
  const commonFeatureCount = await writeCommonOutput(header, outputFeatures, sampleIds, featureValues);

  const totalRows = sickSummary.rowCount + TARGET_HEALTHY;
  const report = [
    `Arquivo gerado: ${OUTPUT_CSV}`,
    `Arquivo filtrado por colunas comuns gerado: ${COMMON_OUTPUT_CSV}`,
    `Linhas de doentes copiadas: ${sickSummary.rowCount}`,
    `Classes no CSV original: ${formatClassCounts(sickSummary.classCounts)}`,
    `Linhas saudaveis adicionadas: ${TARGET_HEALTHY}`,
    `Total de linhas de dados no CSV final: ${totalRows}`,
    `Total de colunas: ${header.length}`,
    `miRNAs esperados: ${outputFeatures.length}`,
    `Precursores mapeados diretamente via RNAcentral/miRBase: ${featureToPreUrn.size}`,
    `miRNAs maduros humanos no mapeamento RNAcentral/miRBase: ${urnToMatureNames.size}`,
    `Colunas preenchidas a partir do TXT saudavel: ${featureValues.size}`,
    `Colunas de miRNA no arquivo filtrado por comuns: ${commonFeatureCount}`,
    `Colunas sem mapeamento direto de precursor: ${missingMapping.length}`,
    `Colunas sem miRNA maduro correspondente no TXT: ${missingInHealthyTxt.length}`,
    `Observacao: o TXT saudavel esta em nivel de miRNA maduro. Os valores saudaveis foram agregados por nome base, removendo sufixos como -5p/-3p e preenchendo as colunas precursoras equivalentes.`,
    "",
    "Colunas sem mapeamento direto de precursor:",
    ...missingMapping,
    "",
    "Colunas sem miRNA maduro correspondente no TXT:",
    ...missingInHealthyTxt,
    "",
    "Exemplos de colunas preenchidas e miRNAs maduros usados:",
    ...[...featureMatchedBy.entries()]
      .slice(0, 30)
      .map(([feature, names]) => `${feature}: ${[...names].join(", ")}`),
    "",
  ].join("\n");

  await fs.promises.writeFile(REPORT_TXT, report, "utf8");
  console.log(report);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
