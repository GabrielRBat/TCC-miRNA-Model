const assert = require("assert");
const fs = require("fs");
const path = require("path");
const stats = require("./validate_mirna_external_cohort.js");

const ROOT = path.resolve(__dirname, "..");
const REPORT = path.join(ROOT, "reports", "gse73002_statistics_test.txt");
const results = [];

function approximately(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `esperado ${expected}; observado ${actual}`);
}

function test(name, callback) {
  try {
    callback();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}

test("parser CSV preserva virgula e aspas escapadas", () => {
  assert.deepStrictEqual(stats.parseCsvLine('a,"b,c","d""e"'), ["a", "b,c", 'd"e']);
});
test("normalizacao remove prefixo humano e troca sublinhado", () => {
  assert.strictEqual(stats.normalizeMirna("hsa_miR-32-3p"), "mir-32-3p");
});
test("familia remove braco maduro", () => assert.strictEqual(stats.matureFamily("hsa-miR-32-3p"), "mir-32"));
test("familia remove locus numerico sem confundir o nome-base", () => assert.strictEqual(stats.matureFamily("hsa-let-7a-1-5p"), "let-7a"));
test("AUC perfeita crescente vale 1", () => approximately(stats.computeAuc([3, 4], [1, 2]), 1));
test("AUC perfeitamente invertida vale 0", () => approximately(stats.computeAuc([1, 2], [3, 4]), 0));
test("AUC com empates completos vale 0,5", () => approximately(stats.computeAuc([1, 1], [1, 1]), 0.5));
test("IC da AUC fica contido em zero a um", () => {
  const interval = stats.aucConfidenceInterval(0.75, 100, 100);
  assert.ok(interval[0] >= 0 && interval[1] <= 1 && interval[0] < 0.75 && interval[1] > 0.75);
});
test("p unilateral sob AUC 0,5 fica aproximadamente 0,5", () => approximately(stats.aucPValue(0.5, 100, 100), 0.5, 1e-7));
test("p unilateral diminui quando a AUC aumenta", () => assert.ok(stats.aucPValue(0.8, 100, 100) < stats.aucPValue(0.6, 100, 100)));
test("Benjamini-Hochberg produz valores conhecidos e monotonicos", () => {
  const items = [{ pValue: 0.01 }, { pValue: 0.04 }, { pValue: 0.03 }];
  stats.benjaminiHochberg(items);
  approximately(items[0].fdrBh, 0.03);
  approximately(items[1].fdrBh, 0.04);
  approximately(items[2].fdrBh, 0.04);
});
test("Hedges g preserva a direcao da diferenca", () => assert.ok(stats.hedgesG([4, 5, 6], [1, 2, 3]) > 0));
test("IC da diferenca contem a diferenca observada", () => {
  const difference = stats.mean([4, 5, 6]) - stats.mean([1, 2, 3]);
  const interval = stats.meanDifferenceConfidenceInterval([4, 5, 6], [1, 2, 3]);
  assert.ok(interval[0] < difference && interval[1] > difference);
});
test("Spearman identifica ordenacao igual", () => approximately(stats.spearman([1, 2, 3], [10, 20, 30]), 1));
test("Spearman identifica ordenacao inversa", () => approximately(stats.spearman([1, 2, 3], [30, 20, 10]), -1));

const failures = results.filter((item) => !item.ok);
const lines = [
  "Testes unitarios das estatisticas da coorte externa GSE73002",
  "",
  `Resultado: ${failures.length ? "FALHOU" : "APROVADO"}`,
  `Testes: ${results.length}`,
  `Falhas: ${failures.length}`,
  "",
  ...results.map((item) => `${item.ok ? "OK" : "FALHA"}\t${item.name}${item.detail ? `\t${item.detail}` : ""}`),
  "",
];
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
if (failures.length) process.exitCode = 1;
