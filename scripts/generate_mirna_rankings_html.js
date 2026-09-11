const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const SEQUENCE_RANKING_CSV = fromRoot("data", "processed", "mirna_candidate_discovery_model_ranking.csv");
const VALIDATION_RANKING_CSV = fromRoot("data", "processed", "mirna_patient_candidate_validation.csv");
const INTEGRATED_RANKING_CSV = fromRoot("data", "processed", "mirna_patient_candidate_integrated_ranking.csv");
const SEQUENCE_REPORT = fromRoot("reports", "modelo_mirna_candidate_discovery_report.txt");
const VALIDATION_REPORT = fromRoot("reports", "modelo_mirna_patient_candidate_validation_report.txt");

const OUTPUT_HTML = fromRoot("reports", "mirna_rankings_dashboard.html");

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

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""]));
  });
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 4) {
  const number = toNumber(value);
  return number === null ? "" : number.toFixed(digits);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compactSequenceRows(rows) {
  return rows.map((row) => ({
    rank: toNumber(row.rank),
    mirna: row.mirna,
    expressao: row.tem_expressao_no_dataset,
    score: toNumber(row.score_modelo_sequencial),
    prob: toNumber(row.probabilidade_contrastiva_bruta),
    logit: toNumber(row.logit_modelo_sequencial),
    features: row.features_expressao_associadas,
    referencias: row.marcadores_referencia_mais_proximos,
    kmers: row.features_kmer_mais_influentes,
  }));
}

function compactPatientRows(rows) {
  return rows.map((row) => ({
    rank_validacao: toNumber(row.rank_validacao_pacientes),
    rank_integrado: toNumber(row.rank_integrado),
    mirna: row.mirna,
    validacao: toNumber(row.score_validacao_pacientes),
    score_final: toNumber(row.score_final_descoberta),
    score_seq: toNumber(row.score_modelo_sequencial),
    rank_seq: toNumber(row.rank_modelo_sequencial),
    auc: toNumber(row.test_auc),
    acc: toNumber(row.test_accuracy),
    precision: toNumber(row.test_precision),
    recall: toNumber(row.test_recall_sensibilidade),
    specificity: toNumber(row.test_specificity),
    f1: toNumber(row.test_f1),
    log2fc: toNumber(row.log2_fc_doente_vs_saudavel),
    media_doente: toNumber(row.media_doente),
    media_saudavel: toNumber(row.media_saudavel),
    pct_doente: toNumber(row.pct_doentes_maior_que_zero),
    pct_saudavel: toNumber(row.pct_saudaveis_maior_que_zero),
    direcao: row.direcao_aprendida_no_paciente,
    features: row.features_expressao,
    referencias: row.marcadores_referencia_mais_proximos,
    kmers: row.features_kmer_mais_influentes,
  }));
}

function mean(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  return numeric.reduce((sum, value) => sum + value, 0) / Math.max(1, numeric.length);
}

function countWhere(values, predicate) {
  return values.filter((value) => Number.isFinite(value) && predicate(value)).length;
}

function renderMetric(label, value, hint) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
}

function buildHtml({ sequenceRows, validationRows, integratedRows }) {
  const validationScores = validationRows.map((row) => row.validacao);
  const precisions = validationRows.map((row) => row.precision);
  const aucs = validationRows.map((row) => row.auc);
  const accuracies = validationRows.map((row) => row.acc);
  const sequenceWithExpression = sequenceRows.filter((row) => row.expressao === "sim").length;

  const dataPayload = JSON.stringify(
    {
      sequenceRows,
      validationRows,
      integratedRows,
    },
    null,
    0
  ).replaceAll("</", "<\\/");

  const metrics = [
    renderMetric("Modelo 1 candidatos", sequenceRows.length, "miRBase maduro humano"),
    renderMetric("Com expressao", sequenceWithExpression, "seguem para Modelo 2"),
    renderMetric("Modelo 2 validados", validationRows.length, "candidatos com feature no dataset"),
    renderMetric("Precision media", round(mean(precisions)), "Modelo 2"),
    renderMetric("AUC media", round(mean(aucs)), "Modelo 2"),
    renderMetric("Accuracy media", round(mean(accuracies)), "Modelo 2"),
    renderMetric("Precision >= 0.90", countWhere(precisions, (value) => value >= 0.9), "candidatos"),
    renderMetric("AUC >= 0.90", countWhere(aucs, (value) => value >= 0.9), "candidatos"),
  ].join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>miRNA Rankings Dashboard</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    :root {
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #627083;
      --line: #d8dee8;
      --accent: #0f766e;
      --accent-2: #7c2d12;
      --good: #0b6b3a;
      --warn: #915d00;
      --shadow: 0 10px 24px rgba(20, 30, 45, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }

    header {
      padding: 28px 28px 18px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.15;
      letter-spacing: 0;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 18px;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      color: var(--muted);
      max-width: 980px;
      line-height: 1.5;
    }

    main {
      padding: 22px 28px 32px;
      display: grid;
      gap: 20px;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(150px, 1fr));
      gap: 12px;
    }

    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      box-shadow: var(--shadow);
      min-height: 105px;
    }

    .metric span,
    .metric small {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }

    .metric strong {
      display: block;
      margin: 8px 0;
      font-size: 26px;
      line-height: 1;
      letter-spacing: 0;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 16px;
      overflow: hidden;
    }

    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }

    button {
      border: 1px solid var(--line);
      background: #f9fafb;
      color: var(--ink);
      border-radius: 6px;
      padding: 9px 12px;
      cursor: pointer;
      font-weight: 650;
    }

    button.active {
      border-color: var(--accent);
      background: #e6f4f1;
      color: #064e49;
    }

    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    input,
    select {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      min-height: 38px;
      background: #fff;
      color: var(--ink);
    }

    input {
      min-width: min(420px, 100%);
      flex: 1;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .chart {
      min-height: 390px;
    }

    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      min-width: 1080px;
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 9px 10px;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }

    th {
      position: sticky;
      top: 0;
      background: #f4f6f8;
      z-index: 1;
      cursor: pointer;
      color: #344054;
    }

    td.wrap {
      white-space: normal;
      min-width: 240px;
      max-width: 440px;
    }

    .note {
      border-left: 4px solid var(--accent-2);
      background: #fff8f3;
      padding: 12px 14px;
      color: #4b5563;
      border-radius: 6px;
      line-height: 1.45;
    }

    .hidden { display: none; }
    .status { color: var(--muted); font-size: 13px; }

    @media (max-width: 980px) {
      header,
      main { padding-left: 16px; padding-right: 16px; }
      .metrics { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
      .grid-2 { grid-template-columns: 1fr; }
      h1 { font-size: 24px; }
    }

    @media (max-width: 560px) {
      .metrics { grid-template-columns: 1fr; }
      button { flex: 1; }
    }
  </style>
</head>
<body>
  <header>
    <h1>miRNA Rankings Dashboard</h1>
    <p>Visualizacao dos rankings gerados pelo Modelo 1 sequencial, pelo Modelo 2 de validacao em pacientes e pelo ranking integrado. Os scores sao computacionais e nao substituem validacao laboratorial.</p>
  </header>

  <main>
    <section class="metrics">
      ${metrics}
    </section>

    <section class="panel">
      <h2>Visao Grafica</h2>
      <div class="grid-2">
        <div id="scatter" class="chart"></div>
        <div id="bar" class="chart"></div>
      </div>
      <p class="status" id="plot-status"></p>
    </section>

    <section class="panel">
      <h2>Rankings</h2>
      <div class="tabs">
        <button type="button" class="tab active" data-view="integrated">Ranking integrado</button>
        <button type="button" class="tab" data-view="validation">Validacao em pacientes</button>
        <button type="button" class="tab" data-view="sequence">Modelo 1 sequencial</button>
      </div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Filtrar por miRNA, feature, direcao, referencia ou k-mer">
        <select id="page-size">
          <option value="25">25 linhas</option>
          <option value="50">50 linhas</option>
          <option value="100">100 linhas</option>
          <option value="500">500 linhas</option>
        </select>
        <button type="button" id="prev">Anterior</button>
        <button type="button" id="next">Proximo</button>
        <span class="status" id="table-status"></span>
      </div>
      <div class="table-wrap">
        <table id="ranking-table"></table>
      </div>
    </section>

    <section class="note">
      O Modelo 2 compara expressao em doentes contra saudaveis. Quando o dataset tem uma feature em nivel de precursor/familia, candidatos maduros 5p e 3p podem compartilhar a mesma metrica de validacao. Nesses casos, a evidencia e da feature disponivel no dataset, nao uma distincao experimental entre bracos maduros.
    </section>
  </main>

  <script>
    const DATA = ${dataPayload};

    const views = {
      integrated: {
        rows: DATA.integratedRows,
        columns: [
          ["rank_integrado", "Rank integrado"],
          ["rank_validacao", "Rank validacao"],
          ["mirna", "miRNA"],
          ["score_final", "Score final"],
          ["validacao", "Validacao"],
          ["score_seq", "Score seq."],
          ["auc", "AUC"],
          ["acc", "Accuracy"],
          ["precision", "Precision"],
          ["log2fc", "log2FC"],
          ["direcao", "Direcao"],
          ["features", "Features"]
        ]
      },
      validation: {
        rows: DATA.validationRows,
        columns: [
          ["rank_validacao", "Rank validacao"],
          ["rank_integrado", "Rank integrado"],
          ["mirna", "miRNA"],
          ["validacao", "Validacao"],
          ["auc", "AUC"],
          ["acc", "Accuracy"],
          ["precision", "Precision"],
          ["recall", "Recall"],
          ["specificity", "Specificity"],
          ["f1", "F1"],
          ["log2fc", "log2FC"],
          ["pct_doente", "% doente > 0"],
          ["pct_saudavel", "% saudavel > 0"],
          ["direcao", "Direcao"],
          ["features", "Features"]
        ]
      },
      sequence: {
        rows: DATA.sequenceRows,
        columns: [
          ["rank", "Rank seq."],
          ["mirna", "miRNA"],
          ["expressao", "Expressao no dataset"],
          ["score", "Score sequencial"],
          ["prob", "Prob. bruta"],
          ["logit", "Logit"],
          ["features", "Features expressao"],
          ["referencias", "Referencias proximas"],
          ["kmers", "K-mers influentes"]
        ]
      }
    };

    let activeView = "integrated";
    let sortKey = "rank_integrado";
    let sortDirection = 1;
    let page = 0;

    function formatValue(value) {
      if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(Math.abs(value) >= 10 ? 2 : 4);
      return value ?? "";
    }

    function searchable(row) {
      return Object.values(row).join(" ").toLowerCase();
    }

    function filteredRows() {
      const query = document.getElementById("search").value.trim().toLowerCase();
      let rows = views[activeView].rows;
      if (query) rows = rows.filter((row) => searchable(row).includes(query));
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDirection;
        return String(av ?? "").localeCompare(String(bv ?? "")) * sortDirection;
      });
      return rows;
    }

    function renderTable() {
      const table = document.getElementById("ranking-table");
      const pageSize = Number(document.getElementById("page-size").value);
      const rows = filteredRows();
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      page = Math.min(page, totalPages - 1);
      const slice = rows.slice(page * pageSize, (page + 1) * pageSize);
      const columns = views[activeView].columns;

      table.innerHTML = "<thead><tr>" + columns.map(([key, label]) => '<th data-key="' + key + '">' + label + "</th>").join("") + "</tr></thead>" +
        "<tbody>" + slice.map((row) => "<tr>" + columns.map(([key]) => {
          const wrap = ["features", "referencias", "kmers", "direcao"].includes(key) ? " class=\\"wrap\\"" : "";
          return "<td" + wrap + ">" + String(formatValue(row[key])).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") + "</td>";
        }).join("") + "</tr>").join("") + "</tbody>";

      table.querySelectorAll("th").forEach((th) => {
        th.addEventListener("click", () => {
          const key = th.dataset.key;
          if (sortKey === key) sortDirection *= -1;
          else {
            sortKey = key;
            sortDirection = 1;
          }
          renderTable();
        });
      });

      document.getElementById("table-status").textContent =
        rows.length + " linhas filtradas | pagina " + (page + 1) + " de " + totalPages;
    }

    function setView(view) {
      activeView = view;
      sortKey = view === "sequence" ? "rank" : view === "validation" ? "rank_validacao" : "rank_integrado";
      sortDirection = 1;
      page = 0;
      document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
      renderTable();
    }

    function renderPlots() {
      if (!window.Plotly) {
        document.getElementById("plot-status").textContent = "Graficos indisponiveis sem acesso ao Plotly CDN. As tabelas continuam funcionando.";
        return;
      }

      const integrated = DATA.integratedRows.slice(0, 80);
      Plotly.newPlot("scatter", [{
        type: "scatter",
        mode: "markers",
        x: DATA.validationRows.map((row) => row.score_seq),
        y: DATA.validationRows.map((row) => row.validacao),
        text: DATA.validationRows.map((row) => row.mirna),
        marker: {
          size: DATA.validationRows.map((row) => 7 + Math.max(0, row.score_final || 0) * 10),
          color: DATA.validationRows.map((row) => row.score_final),
          colorscale: "Viridis",
          showscale: true
        },
        hovertemplate: "%{text}<br>seq=%{x:.3f}<br>validacao=%{y:.3f}<extra></extra>"
      }], {
        title: "Sequencia vs validacao em pacientes",
        xaxis: { title: "Score Modelo 1" },
        yaxis: { title: "Score Modelo 2" },
        margin: { t: 48, r: 18, b: 52, l: 58 }
      }, { responsive: true, displayModeBar: false });

      Plotly.newPlot("bar", [{
        type: "bar",
        orientation: "h",
        y: integrated.slice(0, 20).map((row) => row.mirna).reverse(),
        x: integrated.slice(0, 20).map((row) => row.score_final).reverse(),
        marker: { color: "#0f766e" },
        hovertemplate: "%{y}<br>score final=%{x:.3f}<extra></extra>"
      }], {
        title: "Top 20 ranking integrado",
        xaxis: { title: "Score final" },
        margin: { t: 48, r: 18, b: 52, l: 110 }
      }, { responsive: true, displayModeBar: false });
    }

    document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    document.getElementById("search").addEventListener("input", () => { page = 0; renderTable(); });
    document.getElementById("page-size").addEventListener("change", () => { page = 0; renderTable(); });
    document.getElementById("prev").addEventListener("click", () => { page = Math.max(0, page - 1); renderTable(); });
    document.getElementById("next").addEventListener("click", () => { page += 1; renderTable(); });

    renderTable();
    renderPlots();
  </script>
</body>
</html>`;
}

function main() {
  for (const requiredPath of [SEQUENCE_RANKING_CSV, VALIDATION_RANKING_CSV, INTEGRATED_RANKING_CSV]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`Arquivo obrigatorio nao encontrado: ${requiredPath}`);
  }

  const sequenceRows = compactSequenceRows(readCsv(SEQUENCE_RANKING_CSV));
  const validationRows = compactPatientRows(readCsv(VALIDATION_RANKING_CSV));
  const integratedRows = compactPatientRows(readCsv(INTEGRATED_RANKING_CSV));
  fs.mkdirSync(path.dirname(OUTPUT_HTML), { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, buildHtml({ sequenceRows, validationRows, integratedRows }), "utf8");

  console.log(`Dashboard HTML gerado: ${OUTPUT_HTML}`);
  if (fs.existsSync(SEQUENCE_REPORT)) console.log(`Relatorio Modelo 1: ${SEQUENCE_REPORT}`);
  if (fs.existsSync(VALIDATION_REPORT)) console.log(`Relatorio Modelo 2: ${VALIDATION_REPORT}`);
}

main();
