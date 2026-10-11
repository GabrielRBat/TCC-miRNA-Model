const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const SEQUENCE_RANKING_CSV = fromRoot("data", "processed", "mirna_candidate_discovery_model_ranking.csv");
const VALIDATION_RANKING_CSV = fromRoot("data", "processed", "mirna_patient_candidate_validation.csv");
const INTEGRATED_RANKING_CSV = fromRoot("data", "processed", "mirna_patient_candidate_integrated_ranking.csv");
const EXTERNAL_RANKING_CSV = fromRoot("data", "processed", "gse73002_ts_external_validation.csv");
const EXTERNAL_CENTERED_RANKING_CSV = fromRoot("data", "processed", "gse73002_ts_external_validation_centered_sensitivity.csv");
const PATIENT_MODEL_JSON = fromRoot("models", "modelo_mirna_patient_candidate_validation.json");
const EXTERNAL_SUMMARY_JSON = fromRoot("reports", "gse73002_ts_external_validation_summary.json");
const EXTERNAL_CENTERED_SUMMARY_JSON = fromRoot("reports", "gse73002_ts_external_validation_centered_sensitivity_summary.json");
const GLOBAL_SHIFT_JSON = fromRoot("reports", "gse73002_global_shift_audit.json");
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
    prob: toNumber(row.probabilidade_pu_consenso_bruta ?? row.probabilidade_contrastiva_bruta),
    logit: toNumber(row.logit_modelo_sequencial),
    estabilidade_mediana: toNumber(row.percentil_mediano_bags_oob),
    estabilidade_iqr: toNumber(row.iqr_percentil_bags_oob),
    frequencia_top10: toNumber(row.frequencia_top_10_bags_oob),
    features: row.features_expressao_associadas,
    referencias: row.marcadores_referencia_mais_proximos,
    kmers: row.features_modelo_mais_influentes ?? row.features_kmer_mais_influentes,
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
    auc: toNumber(row.cv_oof_auc ?? row.test_auc),
    auc_ic_inf: toNumber(row.cv_oof_auc_ic95_inferior_aprox),
    auc_ic_sup: toNumber(row.cv_oof_auc_ic95_superior_aprox),
    fdr: toNumber(row.cv_oof_auc_fdr_bh_aprox),
    acc: toNumber(row.cv_oof_accuracy ?? row.test_accuracy),
    precision: toNumber(row.cv_oof_precision ?? row.test_precision),
    recall: toNumber(row.cv_oof_recall_sensibilidade ?? row.test_recall_sensibilidade),
    specificity: toNumber(row.cv_oof_specificity ?? row.test_specificity),
    f1: toNumber(row.cv_oof_f1 ?? row.test_f1),
    cliffs_delta: toNumber(row.cliffs_delta_expressao_log1p),
    log2fc: toNumber(row.log2_fc_doente_vs_saudavel),
    media_doente: toNumber(row.media_doente),
    media_saudavel: toNumber(row.media_saudavel),
    pct_doente: toNumber(row.pct_doentes_maior_que_zero),
    pct_saudavel: toNumber(row.pct_saudaveis_maior_que_zero),
    direcao: row.direcao_aprendida_no_paciente,
    ambiguidade: row.ambiguidade_braco_maduro,
    rank_molecular75: toNumber(row.rank_75_modelo1_25_modelo2),
    rank_paciente75: toNumber(row.rank_25_modelo1_75_modelo2),
    pareto: row.fronteira_pareto,
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

function compactExternalRows(rows) {
  return rows.map((row) => ({
    rank_externo: toNumber(row.rank_externo),
    rank_integrado: toNumber(row.rank_integrado_interno),
    mirna: row.mirna,
    score_integrado: toNumber(row.score_integrado_interno),
    auc: toNumber(row.auc_externa_direcional),
    auc_ic_inf: toNumber(row.auc_externa_ic95_inferior),
    auc_ic_sup: toNumber(row.auc_externa_ic95_superior),
    fdr: toNumber(row.auc_externa_fdr_bh_aprox),
    hedges_g: toNumber(row.hedges_g_direcional),
    cliffs_delta: toNumber(row.cliffs_delta_direcional),
    diferenca_media: toNumber(row.diferenca_media_escala_analise),
    log2fc: toNumber(row.log2_fc_externo),
    resolucao: row.resolucao_mapeamento,
    ambiguidade: row.ambiguidade_interna_braco,
    concordante: row.direcao_concordante,
    replicado: row.replicacao_madura_exata,
    auc_060: row.replicacao_magnitude_auc_0_60,
    features: row.features_externas,
  }));
}

function renderDefinition(term, description) {
  return `<article class="definition"><strong>${escapeHtml(term)}</strong><span>${escapeHtml(description)}</span></article>`;
}

function buildHtml({ sequenceRows, validationRows, integratedRows, patientModel, externalRows, centeredRows, externalSummary, centeredSummary, globalShift }) {
  const validationScores = validationRows.map((row) => row.validacao);
  const precisions = validationRows.map((row) => row.precision);
  const aucs = validationRows.map((row) => row.auc);
  const accuracies = validationRows.map((row) => row.acc);
  const sequenceWithExpression = sequenceRows.filter((row) => row.expressao === "sim").length;
  const uniqueHypothesisCount = patientModel.statistical_inference?.unique_expression_hypothesis_count ?? validationRows.length;
  const fdrSignificant = patientModel.statistical_inference?.significant_unique_expression_hypothesis_count_fdr_0_05 ?? validationRows.filter((row) => Number.isFinite(row.fdr) && row.fdr < 0.05).length;
  const paretoCount = integratedRows.filter((row) => row.pareto === "sim").length;
  const primaryReplicated = new Set(externalRows.filter((row) => row.replicado === "sim").map((row) => row.mirna));
  const centeredReplicated = new Set(centeredRows.filter((row) => row.replicado === "sim").map((row) => row.mirna));
  const robustReplicated = [...primaryReplicated].filter((mirna) => centeredReplicated.has(mirna)).length;
  const primaryUnambiguous = new Set(externalRows.filter((row) => row.replicado === "sim" && row.ambiguidade === "nao").map((row) => row.mirna));
  const centeredUnambiguous = new Set(centeredRows.filter((row) => row.replicado === "sim" && row.ambiguidade === "nao").map((row) => row.mirna));
  const robustUnambiguous = [...primaryUnambiguous].filter((mirna) => centeredUnambiguous.has(mirna)).length;
  const robustUnambiguousPractical = externalRows.filter((row) => row.replicado === "sim" && row.ambiguidade === "nao" && row.auc_060 === "sim" && centeredRows.some((centered) => centered.mirna === row.mirna && centered.replicado === "sim" && centered.ambiguidade === "nao" && centered.auc_060 === "sim")).length;
  const primaryByMirna = new Map(externalRows.map((row) => [row.mirna, row]));
  const centeredByMirna = new Map(centeredRows.map((row) => [row.mirna, row]));
  for (const row of externalRows) {
    const centered = centeredByMirna.get(row.mirna);
    row.robusto_duas = row.replicado === "sim" && centered?.replicado === "sim" ? "sim" : "nao";
    row.nucleo_estrito = row.robusto_duas === "sim" && row.ambiguidade === "nao" && centered?.ambiguidade === "nao" ? "sim" : "nao";
    row.auc_060_duas = row.auc_060 === "sim" && centered?.auc_060 === "sim" ? "sim" : "nao";
  }
  for (const row of centeredRows) {
    const primary = primaryByMirna.get(row.mirna);
    row.robusto_duas = row.replicado === "sim" && primary?.replicado === "sim" ? "sim" : "nao";
    row.nucleo_estrito = row.robusto_duas === "sim" && row.ambiguidade === "nao" && primary?.ambiguidade === "nao" ? "sim" : "nao";
    row.auc_060_duas = row.auc_060 === "sim" && primary?.auc_060 === "sim" ? "sim" : "nao";
  }

  const dataPayload = JSON.stringify(
    {
      sequenceRows,
      validationRows,
      integratedRows,
      externalRows,
      centeredRows,
    },
    null,
    0
  ).replaceAll("</", "<\\/");

  const metrics = [
    renderMetric("Modelo 1 candidatos", sequenceRows.length, "miRBase maduro humano"),
    renderMetric("Com expressão", sequenceWithExpression, "seguem para Modelo 2"),
    renderMetric("Modelo 2 validados", validationRows.length, "candidatos com feature no dataset"),
    renderMetric("Precisão CV média", round(mean(precisions)), "predições out-of-fold"),
    renderMetric("AUC CV média", round(mean(aucs)), "predições out-of-fold"),
    renderMetric("Acurácia CV média", round(mean(accuracies)), "predições out-of-fold"),
    renderMetric("Precisão >= 0.90", countWhere(precisions, (value) => value >= 0.9), "candidatos"),
    renderMetric("AUC >= 0.90", countWhere(aucs, (value) => value >= 0.9), "candidatos"),
    renderMetric("Hipoteses FDR < 0.05", fdrSignificant, `de ${uniqueHypothesisCount} expressoes unicas`),
    renderMetric("Fronteira de Pareto", paretoCount, "fortes sem peso 50/50"),
    renderMetric("Coorte externa", externalSummary.samples.total, `${externalSummary.samples.breastCancer} casos + ${externalSummary.samples.nonCancerControls} controles`),
    renderMetric("Replicados externos", externalSummary.replication.statisticallyReplicatedMatureExact, "mapeamento maduro exato; analise primaria"),
    renderMetric("Robustos nas 2 analises", robustReplicated, "replicados antes e depois da centralizacao"),
    renderMetric("Nucleo maduro estrito", robustUnambiguous, "sem ambiguidade interna de braco"),
    renderMetric("Nucleo estrito AUC >= 0,60", robustUnambiguousPractical, "magnitude mantida nas 2 analises"),
    renderMetric("AUC do sinal global", round(globalShift.globalSampleMean.aucCancerHigher), "alerta de deslocamento de intensidade"),
  ].join("\n");

  const metricDefinitions = [
    renderDefinition(
      "Modelo 1 candidatos",
      "Total de miRNAs maduros humanos ranqueados pelo ensemble PU com k-mers, seed e composicao da sequencia madura."
    ),
    renderDefinition(
      "Com expressão",
      "Subconjunto do ranking sequencial que possui feature correspondente no dataset de pacientes e pode ser avaliado pelo Modelo 2."
    ),
    renderDefinition(
      "Modelo 2 validados",
      "Quantidade de candidatos testados em doentes contra saudáveis usando a expressão disponível no dataset."
    ),
    renderDefinition(
      "Precisão CV média",
      "Nas predições out-of-fold, mede a proporção de classe 1 entre os casos classificados como doentes pelo mini-modelo de cada candidato."
    ),
    renderDefinition(
      "AUC CV média",
      "Capacidade média de separar doentes e saudáveis nas predições out-of-fold; 0.5 equivale a acaso e 1.0 indica separação perfeita."
    ),
    renderDefinition(
      "Acurácia CV média",
      "Proporção média de amostras corretamente classificadas na validação cruzada estratificada de 5 folds do Modelo 2."
    ),
    renderDefinition(
      "Precisão >= 0.90 / AUC >= 0.90",
      "Contagem de candidatos com desempenho alto nas predições out-of-fold. Esses números continuam sendo validação computacional, não clínica."
    ),
    renderDefinition(
      "Hipoteses FDR < 0.05",
      "Contagem de expressoes unicas apos correcao Benjamini-Hochberg e teste unilateral AUC > 0,5. Bracos que compartilham a mesma feature nao sao contados como testes independentes."
    ),
    renderDefinition(
      "Fronteira de Pareto",
      "Candidatos para os quais nenhum outro possui simultaneamente score maior nos Modelos 1 e 2. Nao depende de escolher o peso 50/50."
    ),
    renderDefinition(
      "Replicados externos",
      "miRNAs com mapeamento maduro exato, direcao concordante com a base interna, IC95% direcional acima de 0,5 e FDR < 0,05 na coorte GSE73002 TS."
    ),
    renderDefinition(
      "Robustos nas 2 analises",
      "Intersecao entre a analise primaria e a sensibilidade pos-hoc. Inclui candidatos cujo Modelo 2 interno usou uma feature compartilhada entre bracos."
    ),
    renderDefinition(
      "Nucleo maduro estrito",
      "Subconjunto reproduzido nas duas analises com correspondencia madura externa exata e sem ambiguidade 5p/3p na evidencia interna. E a evidencia mais rigorosa para o foco em miRNA maduro."
    ),
    renderDefinition(
      "AUC do sinal global",
      "Quanto a media de todos os 2.540 miRNAs separa casos e controles. Um valor muito alto alerta que parte do desempenho pode refletir intensidade global, lote ou composicao da coorte."
    ),
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

    .explain-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(220px, 1fr));
      gap: 10px;
    }

    .definition {
      border: 1px solid var(--line);
      background: #fafbfc;
      border-radius: 8px;
      padding: 12px;
      min-height: 92px;
    }

    .definition strong,
    .definition span {
      display: block;
    }

    .definition strong {
      margin-bottom: 6px;
      font-size: 13px;
    }

    .definition span {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.42;
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

    .chart-caption {
      margin-top: 10px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
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
      .explain-grid { grid-template-columns: 1fr; }
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
    <p>Visualização dos rankings gerados pelo Modelo 1 PU de sequência madura, pelo Modelo 2 de validação em pacientes e pelo ranking integrado. Os scores são computacionais e não substituem validação laboratorial.</p>
  </header>

  <main>
    <section class="metrics">
      ${metrics}
    </section>

    <section class="panel">
      <h2>O que cada métrica resume</h2>
      <div class="explain-grid">
        ${metricDefinitions}
      </div>
    </section>

    <section class="panel">
      <h2>Visão Gráfica</h2>
      <div class="grid-2">
        <div>
          <div id="scatter" class="chart"></div>
          <p class="chart-caption">Cada ponto é um miRNA candidato validado no dataset. No eixo X fica o suporte da sequência madura no Modelo 1; no eixo Y fica a validação em pacientes do Modelo 2. Pontos no canto superior direito combinam as duas fontes de evidência computacional.</p>
        </div>
        <div>
          <div id="bar" class="chart"></div>
          <p class="chart-caption">Mostra os 20 primeiros candidatos do ranking integrado. Esse ranking mistura metade do score sequencial e metade do score de validação em pacientes, servindo como lista priorizada para discussão científica.</p>
        </div>
      </div>
      <p class="status" id="plot-status"></p>
    </section>

    <section class="panel">
      <h2>Rankings</h2>
      <p class="chart-caption">O ranking integrado prioriza candidatos com bom suporte nos dois modelos. A aba de validação mostra apenas a força no dataset de pacientes. A aba sequencial mostra o ranking bruto do Modelo 1, incluindo candidatos sem expressão disponível para validação.</p>
      <div class="tabs">
        <button type="button" class="tab active" data-view="integrated">Ranking integrado</button>
        <button type="button" class="tab" data-view="validation">Validação em pacientes</button>
        <button type="button" class="tab" data-view="sequence">Modelo 1 PU/sequência madura</button>
        <button type="button" class="tab" data-view="external">GSE73002 primaria</button>
        <button type="button" class="tab" data-view="centered">GSE73002 sensibilidade</button>
      </div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Filtrar por miRNA, feature, direção, referência ou k-mer">
        <select id="page-size">
          <option value="25">25 linhas</option>
          <option value="50">50 linhas</option>
          <option value="100">100 linhas</option>
          <option value="500">500 linhas</option>
        </select>
        <button type="button" id="prev">Anterior</button>
        <button type="button" id="next">Próximo</button>
        <span class="status" id="table-status"></span>
      </div>
      <div class="table-wrap">
        <table id="ranking-table"></table>
      </div>
    </section>

    <section class="note">
      O Modelo 2 compara expressão em doentes contra saudáveis. Quando o dataset tem uma feature em nível de precursor/família, candidatos maduros 5p e 3p podem compartilhar a mesma métrica de validação. Nesses casos, a evidência é da feature disponível no dataset, não uma distinção experimental entre braços maduros.
    </section>
    <section class="note">
      <strong>Alerta da validacao externa:</strong> a media global das 2.540 features separa casos e controles com AUC ${round(globalShift.globalSampleMean.aucCancerHigher)} e ${round(globalShift.featureMeanDirection.proportionHigherInCancer * 100, 2)}% das features aumentam em casos. Por isso, os ${externalSummary.replication.statisticallyReplicatedMatureExact} sinais primarios nao devem ser chamados isoladamente de biomarcadores especificos. A analise centrada e pos-hoc. Dos ${robustReplicated} candidatos reproduzidos nas duas analises, ${robustUnambiguous} tambem nao possuem ambiguidade interna de braco e formam o nucleo maduro mais rigoroso (${robustUnambiguousPractical} com AUC >= 0,60 nas duas). A concordancia entre o score interno e a AUC externa foi baixa (rho = ${round(externalSummary.rankingEvaluation.spearmanInternalScoreVsExternalDirectionalAucMatureExact)}; centrada = ${round(centeredSummary.rankingEvaluation.spearmanInternalScoreVsExternalDirectionalAucMatureExact)}).
    </section>
  </main>

  <script>
    const DATA = ${dataPayload};

    const views = {
      integrated: {
        rows: DATA.integratedRows,
        columns: [
          ["rank_integrado", "Rank integrado"],
          ["rank_validacao", "Rank validação"],
          ["mirna", "miRNA"],
          ["score_final", "Score final"],
          ["validacao", "Validação"],
          ["score_seq", "Score seq."],
          ["auc", "AUC"],
          ["auc_ic_inf", "AUC IC95% inf."],
          ["auc_ic_sup", "AUC IC95% sup."],
          ["fdr", "FDR aprox."],
          ["pareto", "Pareto"],
          ["rank_molecular75", "Rank 75% M1"],
          ["rank_paciente75", "Rank 75% M2"],
          ["acc", "Acurácia"],
          ["precision", "Precisão"],
          ["log2fc", "log2FC"],
          ["direcao", "Direção"],
          ["features", "Features"]
        ]
      },
      validation: {
        rows: DATA.validationRows,
        columns: [
          ["rank_validacao", "Rank validação"],
          ["rank_integrado", "Rank integrado"],
          ["mirna", "miRNA"],
          ["validacao", "Validação"],
          ["auc", "AUC"],
          ["auc_ic_inf", "AUC IC95% inf."],
          ["auc_ic_sup", "AUC IC95% sup."],
          ["fdr", "FDR aprox."],
          ["cliffs_delta", "Cliff's delta"],
          ["ambiguidade", "Ambiguidade 5p/3p"],
          ["acc", "Acurácia"],
          ["precision", "Precisão"],
          ["recall", "Recall"],
          ["specificity", "Especificidade"],
          ["f1", "F1"],
          ["log2fc", "log2FC"],
          ["pct_doente", "% doente > 0"],
          ["pct_saudavel", "% saudável > 0"],
          ["direcao", "Direção"],
          ["features", "Features"]
        ]
      },
      sequence: {
        rows: DATA.sequenceRows,
        columns: [
          ["rank", "Rank seq."],
          ["mirna", "miRNA"],
          ["expressao", "Expressão no dataset"],
          ["score", "Score Modelo 1"],
          ["prob", "Consenso PU bruto"],
          ["logit", "Logit"],
          ["estabilidade_mediana", "Percentil mediano OOB"],
          ["estabilidade_iqr", "IQR percentil OOB"],
          ["frequencia_top10", "FrequÃªncia top 10%"],
          ["features", "Features expressão"],
          ["referencias", "Referências próximas"],
          ["kmers", "Features influentes"]
        ]
      },
      external: {
        rows: DATA.externalRows,
        columns: [
          ["rank_externo", "Rank externo"], ["rank_integrado", "Rank interno"], ["mirna", "miRNA"],
          ["auc", "AUC direcional"], ["auc_ic_inf", "AUC IC95% inf."], ["auc_ic_sup", "AUC IC95% sup."],
          ["fdr", "FDR"], ["hedges_g", "Hedges g"], ["cliffs_delta", "Cliff's delta"],
          ["log2fc", "log2FC"], ["resolucao", "Mapeamento"], ["concordante", "Direcao concordante"],
          ["replicado", "Replicado exato"], ["robusto_duas", "Robusto nas 2"], ["nucleo_estrito", "Nucleo maduro estrito"],
          ["auc_060_duas", "AUC >= 0,60 nas 2"], ["features", "Features externas"]
        ]
      },
      centered: {
        rows: DATA.centeredRows,
        columns: [
          ["rank_externo", "Rank externo"], ["rank_integrado", "Rank interno"], ["mirna", "miRNA"],
          ["auc", "AUC direcional"], ["auc_ic_inf", "AUC IC95% inf."], ["auc_ic_sup", "AUC IC95% sup."],
          ["fdr", "FDR"], ["hedges_g", "Hedges g"], ["cliffs_delta", "Cliff's delta"],
          ["diferenca_media", "Diferenca media centrada"], ["resolucao", "Mapeamento"],
          ["concordante", "Direcao concordante"], ["replicado", "Replicado exato"],
          ["robusto_duas", "Robusto nas 2"], ["nucleo_estrito", "Nucleo maduro estrito"],
          ["auc_060_duas", "AUC >= 0,60 nas 2"], ["features", "Features externas"]
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
      sortKey = view === "sequence" ? "rank" : view === "validation" ? "rank_validacao" : (view === "external" || view === "centered") ? "rank_externo" : "rank_integrado";
      sortDirection = 1;
      page = 0;
      document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
      renderTable();
    }

    function renderPlots() {
      if (!window.Plotly) {
        document.getElementById("plot-status").textContent = "Gráficos indisponíveis sem acesso ao Plotly CDN. As tabelas continuam funcionando.";
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
        hovertemplate: "%{text}<br>seq=%{x:.3f}<br>validação=%{y:.3f}<extra></extra>"
      }], {
        title: "Sequência vs validação em pacientes",
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
  for (const requiredPath of [SEQUENCE_RANKING_CSV, VALIDATION_RANKING_CSV, INTEGRATED_RANKING_CSV, EXTERNAL_RANKING_CSV, EXTERNAL_CENTERED_RANKING_CSV, PATIENT_MODEL_JSON, EXTERNAL_SUMMARY_JSON, EXTERNAL_CENTERED_SUMMARY_JSON, GLOBAL_SHIFT_JSON]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`Arquivo obrigatório não encontrado: ${requiredPath}`);
  }

  const sequenceRows = compactSequenceRows(readCsv(SEQUENCE_RANKING_CSV));
  const validationRows = compactPatientRows(readCsv(VALIDATION_RANKING_CSV));
  const integratedRows = compactPatientRows(readCsv(INTEGRATED_RANKING_CSV));
  const patientModel = JSON.parse(fs.readFileSync(PATIENT_MODEL_JSON, "utf8"));
  const externalRows = compactExternalRows(readCsv(EXTERNAL_RANKING_CSV));
  const centeredRows = compactExternalRows(readCsv(EXTERNAL_CENTERED_RANKING_CSV));
  const externalSummary = JSON.parse(fs.readFileSync(EXTERNAL_SUMMARY_JSON, "utf8"));
  const centeredSummary = JSON.parse(fs.readFileSync(EXTERNAL_CENTERED_SUMMARY_JSON, "utf8"));
  const globalShift = JSON.parse(fs.readFileSync(GLOBAL_SHIFT_JSON, "utf8"));
  fs.mkdirSync(path.dirname(OUTPUT_HTML), { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, buildHtml({ sequenceRows, validationRows, integratedRows, patientModel, externalRows, centeredRows, externalSummary, centeredSummary, globalShift }), "utf8");

  console.log(`Dashboard HTML gerado: ${OUTPUT_HTML}`);
  if (fs.existsSync(SEQUENCE_REPORT)) console.log(`Relatório Modelo 1: ${SEQUENCE_REPORT}`);
  if (fs.existsSync(VALIDATION_REPORT)) console.log(`Relatório Modelo 2: ${VALIDATION_REPORT}`);
}

main();
