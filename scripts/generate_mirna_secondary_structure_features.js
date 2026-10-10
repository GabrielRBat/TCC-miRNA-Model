const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const HAIRPIN_FASTA_PATH = fromRoot("data", "external", "mirbase_hairpin.fa");
const OUTPUT_CSV = fromRoot("data", "processed", "mirna_hairpin_structure_features.csv");
const MIN_LOOP_LENGTH = 3;

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === ",") {
      cells.push(value);
      value = "";
    } else if (character === '"' && value.length === 0) quoted = true;
    else value += character;
  }
  cells.push(value);
  return cells;
}

function normalizeSequence(sequence) {
  return String(sequence ?? "").toUpperCase().replaceAll("T", "U").replace(/[^ACGU]/g, "");
}

function parseHairpinFasta(filePath = HAIRPIN_FASTA_PATH) {
  const entries = [];
  let header = null;
  let sequence = "";
  const flush = () => {
    if (!header) return;
    const [name, accession = ""] = header.split(/\s+/, 2);
    if (name.startsWith("hsa-")) entries.push({ name, accession, sequence: normalizeSequence(sequence) });
  };
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith(">")) {
      flush();
      header = line.slice(1);
      sequence = "";
    } else sequence += line.trim();
  }
  flush();
  return entries;
}

function pairScore(left, right) {
  const pair = `${left}${right}`;
  if (pair === "GC" || pair === "CG") return 3;
  if (pair === "AU" || pair === "UA") return 2;
  if (pair === "GU" || pair === "UG") return 1;
  return 0;
}

function nussinovStructure(sequence) {
  const n = sequence.length;
  if (!n) return "";
  const table = new Int16Array(n * n);
  const at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n || i > j ? 0 : table[i * n + j]);

  for (let span = MIN_LOOP_LENGTH + 1; span < n; span += 1) {
    for (let i = 0; i + span < n; i += 1) {
      const j = i + span;
      let best = Math.max(at(i + 1, j), at(i, j - 1));
      const score = pairScore(sequence[i], sequence[j]);
      if (score > 0) best = Math.max(best, at(i + 1, j - 1) + score);
      for (let split = i; split < j; split += 1) {
        best = Math.max(best, at(i, split) + at(split + 1, j));
      }
      table[i * n + j] = best;
    }
  }

  const structure = Array(n).fill(".");
  const pending = [[0, n - 1]];
  while (pending.length) {
    const [i, j] = pending.pop();
    if (i >= j) continue;
    const value = at(i, j);
    if (value === at(i + 1, j)) {
      pending.push([i + 1, j]);
      continue;
    }
    if (value === at(i, j - 1)) {
      pending.push([i, j - 1]);
      continue;
    }
    const score = pairScore(sequence[i], sequence[j]);
    if (score > 0 && j - i > MIN_LOOP_LENGTH && value === at(i + 1, j - 1) + score) {
      structure[i] = "(";
      structure[j] = ")";
      pending.push([i + 1, j - 1]);
      continue;
    }
    let splitFound = false;
    for (let split = i; split < j; split += 1) {
      if (value === at(i, split) + at(split + 1, j)) {
        pending.push([i, split], [split + 1, j]);
        splitFound = true;
        break;
      }
    }
    if (!splitFound) pending.push([i + 1, j]);
  }
  return structure.join("");
}

function pairsFromDotBracket(structure) {
  const stack = [];
  const pairs = [];
  for (let index = 0; index < structure.length; index += 1) {
    if (structure[index] === "(") stack.push(index);
    else if (structure[index] === ")" && stack.length) pairs.push([stack.pop(), index]);
  }
  return pairs.sort((a, b) => a[0] - b[0]);
}

function structureFeatures(entry, structure, method, mfe = null) {
  const sequence = entry.sequence;
  const pairs = pairsFromDotBracket(structure);
  const pairedByLeft = new Map(pairs.map(([left, right]) => [left, right]));
  const stems = [];
  for (const [left, right] of pairs) {
    if (pairedByLeft.get(left - 1) === right + 1) continue;
    let length = 1;
    while (pairedByLeft.get(left + length) === right - length) length += 1;
    stems.push(length);
  }

  let hairpinLoopCount = 0;
  let internalBulgeCount = 0;
  for (const [left, right] of pairs) {
    const nested = pairs.filter(([innerLeft, innerRight]) => left < innerLeft && innerRight < right);
    if (!nested.length) {
      hairpinLoopCount += 1;
      continue;
    }
    const nearest = nested.reduce((best, pair) => (pair[0] < best[0] ? pair : best));
    if (nearest[0] - left > 1 || right - nearest[1] > 1) internalBulgeCount += 1;
  }

  const pairTypes = { au: 0, gc: 0, gu: 0 };
  for (const [left, right] of pairs) {
    const pair = `${sequence[left]}${sequence[right]}`;
    if (pair === "AU" || pair === "UA") pairTypes.au += 1;
    else if (pair === "GC" || pair === "CG") pairTypes.gc += 1;
    else if (pair === "GU" || pair === "UG") pairTypes.gu += 1;
  }

  const length = Math.max(1, sequence.length);
  const pairCount = pairs.length;
  const stemCount = stems.length;
  const gcCount = [...sequence].filter((base) => base === "G" || base === "C").length;
  return {
    accession: entry.accession,
    hairpin_name: entry.name,
    method,
    dot_bracket: structure,
    mfe_kcal_mol: Number.isFinite(mfe) ? mfe : "",
    mfe_per_nt: Number.isFinite(mfe) ? mfe / length : "",
    sequence_length: sequence.length,
    gc_fraction: gcCount / length,
    paired_fraction: (2 * pairCount) / length,
    unpaired_fraction: 1 - (2 * pairCount) / length,
    pair_count: pairCount,
    stem_count: stemCount,
    stem_density: stemCount / length,
    longest_stem_fraction: (stems.length ? Math.max(...stems) : 0) / length,
    mean_stem_fraction: (stems.length ? stems.reduce((sum, value) => sum + value, 0) / stems.length : 0) / length,
    hairpin_loop_count: hairpinLoopCount,
    hairpin_loop_density: hairpinLoopCount / length,
    internal_bulge_count: internalBulgeCount,
    internal_bulge_density: internalBulgeCount / length,
    pair_au_fraction: pairCount ? pairTypes.au / pairCount : 0,
    pair_gc_fraction: pairCount ? pairTypes.gc / pairCount : 0,
    pair_gu_fraction: pairCount ? pairTypes.gu / pairCount : 0,
  };
}

function rnafoldAvailable() {
  const result = spawnSync("RNAfold", ["--version"], { encoding: "utf8", windowsHide: true });
  return !result.error && result.status === 0;
}

function foldWithRnafold(entries) {
  const input = entries.map((entry) => `>${entry.accession}|${entry.name}\n${entry.sequence}`).join("\n") + "\n";
  const result = spawnSync("RNAfold", ["--noPS", "--jobs=1"], {
    input,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`RNAfold falhou: ${result.error?.message || result.stderr || `status ${result.status}`}`);
  }

  const foldedByAccession = new Map();
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  let currentAccession = null;
  for (const line of lines) {
    if (line.startsWith(">")) {
      currentAccession = line.slice(1).split("|", 1)[0];
      continue;
    }
    const match = line.match(/^([().]+)\s+\(\s*(-?\d+(?:\.\d+)?)\s*\)/);
    if (currentAccession && match) {
      foldedByAccession.set(currentAccession, { structure: match[1], mfe: Number(match[2]) });
      currentAccession = null;
    }
  }
  return foldedByAccession;
}

function writeStructureCsv(rows, outputPath = OUTPUT_CSV) {
  const header = [
    "accession",
    "hairpin_name",
    "method",
    "dot_bracket",
    "mfe_kcal_mol",
    "mfe_per_nt",
    "sequence_length",
    "gc_fraction",
    "paired_fraction",
    "unpaired_fraction",
    "pair_count",
    "stem_count",
    "stem_density",
    "longest_stem_fraction",
    "mean_stem_fraction",
    "hairpin_loop_count",
    "hairpin_loop_density",
    "internal_bulge_count",
    "internal_bulge_density",
    "pair_au_fraction",
    "pair_gc_fraction",
    "pair_gu_fraction",
  ];
  const lines = [header, ...rows.map((row) => header.map((column) => row[column]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines, "utf8");
}

function generateStructureFeatures({ fastaPath = HAIRPIN_FASTA_PATH, outputPath = OUTPUT_CSV } = {}) {
  const entries = parseHairpinFasta(fastaPath);
  const useRnafold = rnafoldAvailable();
  const folded = useRnafold ? foldWithRnafold(entries) : new Map();
  const rows = entries.map((entry) => {
    const prediction = folded.get(entry.accession);
    if (prediction) return structureFeatures(entry, prediction.structure, "viennarna_rnafold_mfe", prediction.mfe);
    const structure = nussinovStructure(entry.sequence);
    return structureFeatures(entry, structure, "nussinov_weighted_pairing_proxy", null);
  });
  writeStructureCsv(rows, outputPath);
  return {
    rows,
    method: useRnafold ? "viennarna_rnafold_mfe" : "nussinov_weighted_pairing_proxy",
    outputPath,
  };
}

function readStructureFeatureCsv(filePath = OUTPUT_CSV) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""]));
  });
}

function main() {
  if (!fs.existsSync(HAIRPIN_FASTA_PATH)) throw new Error(`FASTA nao encontrado: ${HAIRPIN_FASTA_PATH}`);
  const result = generateStructureFeatures();
  console.log(`Features estruturais geradas: ${result.rows.length}`);
  console.log(`Metodo: ${result.method}`);
  console.log(`Saida: ${result.outputPath}`);
  if (result.method !== "viennarna_rnafold_mfe") {
    console.log("Aviso: RNAfold nao encontrado; foi usado proxy estrutural Nussinov sem energia termodinamica.");
  }
}

if (require.main === module) main();

module.exports = {
  OUTPUT_CSV,
  generateStructureFeatures,
  readStructureFeatureCsv,
  nussinovStructure,
  structureFeatures,
};
