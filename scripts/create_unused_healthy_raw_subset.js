const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const SOURCE = fromRoot("data", "raw", "miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).txt");
const BACKUP_DIR = fromRoot("data", "raw", "_local_full_raw");
const BACKUP = path.join(BACKUP_DIR, "miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).full.txt");
const TEMP_OUTPUT = fromRoot("data", "raw", "miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).subset.tmp");

const USED_HEALTHY_SAMPLES = 1339;
const SUBSET_SIZE = 1500;
const FIRST_SAMPLE_INDEX = 1 + USED_HEALTHY_SAMPLES;
const LAST_SAMPLE_INDEX = FIRST_SAMPLE_INDEX + SUBSET_SIZE - 1;

async function ensureBackup() {
  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });

  if (fs.existsSync(BACKUP)) {
    return BACKUP;
  }

  await fs.promises.rename(SOURCE, BACKUP);
  return BACKUP;
}

async function createSubset() {
  const source = await ensureBackup();
  const rl = readline.createInterface({
    input: fs.createReadStream(source),
    crlfDelay: Infinity,
  });
  const out = fs.createWriteStream(TEMP_OUTPUT);

  let lineNumber = 0;
  let selectedSamples = 0;
  let featureRows = 0;

  for await (const line of rl) {
    lineNumber += 1;
    const parts = line.split("\t");
    const selected = [parts[0], ...parts.slice(FIRST_SAMPLE_INDEX, LAST_SAMPLE_INDEX + 1)];

    if (lineNumber === 1) {
      selectedSamples = selected.length - 1;
      if (selectedSamples !== SUBSET_SIZE) {
        throw new Error(`Esperava ${SUBSET_SIZE} amostras, mas selecionei ${selectedSamples}.`);
      }
    } else {
      featureRows += 1;
    }

    out.write(selected.join("\t"));
    out.write("\n");
  }

  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on("error", reject);
  });

  await fs.promises.rename(TEMP_OUTPUT, SOURCE);

  console.log(`Backup local preservado em: ${BACKUP}`);
  console.log(`Arquivo raw substituido por subset: ${SOURCE}`);
  console.log(`Amostras saudaveis usadas no subset: ${selectedSamples}`);
  console.log(`Amostras puladas por ja terem sido usadas no dataset balanceado: ${USED_HEALTHY_SAMPLES}`);
  console.log(`Linhas de features preservadas: ${featureRows}`);
  console.log(`Indices de amostras selecionadas no TXT original: ${FIRST_SAMPLE_INDEX}..${LAST_SAMPLE_INDEX}`);
}

createSubset().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
