const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const INPUT_HTML = fromRoot("reports", "mirna_rankings_dashboard.html");
const OUTPUT_PDF = fromRoot("reports", "mirna_rankings_dashboard.pdf");

const BROWSER_CANDIDATES = [
  process.env.MIRNA_PDF_BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

function findBrowser() {
  const browser = BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!browser) {
    throw new Error(
      "Nenhum navegador Chromium encontrado. Defina MIRNA_PDF_BROWSER com o caminho do msedge.exe ou chrome.exe."
    );
  }
  return browser;
}

function main() {
  if (!fs.existsSync(INPUT_HTML)) {
    throw new Error(`Dashboard HTML nao encontrado: ${INPUT_HTML}. Execute scripts/generate_mirna_rankings_html.js primeiro.`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PDF), { recursive: true });
  const browser = findBrowser();
  const htmlUrl = pathToFileURL(INPUT_HTML).href;

  execFileSync(
    browser,
    [
      "--headless",
      "--disable-gpu",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=5000",
      "--print-to-pdf-no-header",
      `--print-to-pdf=${OUTPUT_PDF}`,
      htmlUrl,
    ],
    { stdio: "inherit" }
  );

  console.log(`Dashboard PDF gerado: ${OUTPUT_PDF}`);
}

main();
