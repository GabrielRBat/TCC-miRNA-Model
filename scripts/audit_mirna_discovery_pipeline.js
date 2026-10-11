const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);

const FILES = {
  model1: fromRoot("models", "modelo_mirna_candidate_discovery.json"),
  ranking1: fromRoot("data", "processed", "mirna_candidate_discovery_model_ranking.csv"),
  model2: fromRoot("models", "modelo_mirna_patient_candidate_validation.json"),
  ranking2: fromRoot("data", "processed", "mirna_patient_candidate_validation.csv"),
  integrated: fromRoot("data", "processed", "mirna_patient_candidate_integrated_ranking.csv"),
  report: fromRoot("reports", "auditoria_pipeline_descoberta_mirna.txt"),
  externalValidator: fromRoot("scripts", "validate_mirna_external_cohort.js"),
  externalFormat: fromRoot("docs", "FORMATO_COORTE_EXTERNA.md"),
  externalPrimary: fromRoot("data", "processed", "gse73002_ts_external_validation.csv"),
  externalCentered: fromRoot("data", "processed", "gse73002_ts_external_validation_centered_sensitivity.csv"),
  externalPrimarySummary: fromRoot("reports", "gse73002_ts_external_validation_summary.json"),
  externalCenteredSummary: fromRoot("reports", "gse73002_ts_external_validation_centered_sensitivity_summary.json"),
  globalShift: fromRoot("reports", "gse73002_global_shift_audit.json"),
};

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else current += character;
    } else if (character === ",") {
      values.push(current);
      current = "";
    } else if (character === '"') quoted = true;
    else current += character;
  }
  values.push(current);
  return values;
}

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""]));
  });
}

const checks = [];
function check(condition, description, detail = "") {
  checks.push({ ok: Boolean(condition), description, detail });
}

function finiteUnit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1;
}

function ranksAreContiguous(rows, column) {
  return rows.every((row, index) => Number(row[column]) === index + 1);
}

function scoresAreDescending(rows, column) {
  return rows.every((row, index) => index === 0 || Number(rows[index - 1][column]) + 1e-12 >= Number(row[column]));
}

function main() {
  for (const [name, filePath] of Object.entries(FILES)) {
    if (name !== "report") check(fs.existsSync(filePath), `arquivo obrigatorio existe: ${path.relative(ROOT, filePath)}`);
  }
  if (checks.some((item) => !item.ok)) return finish();

  const model1 = JSON.parse(fs.readFileSync(FILES.model1, "utf8"));
  const ranking1 = readCsv(FILES.ranking1);
  const validation = model1.internal_recovery_validation;
  const folds = validation?.fold_selections ?? [];
  const heldOutFamilies = folds.flatMap((fold) => fold.held_out_seed_families ?? []);
  const configs = model1.hyperparameter_selection?.candidate_configurations ?? [];
  const modelWeightFeatures = Array.isArray(model1.weights)
    ? model1.weights.map((item) => item[0])
    : Object.keys(model1.weights ?? {});

  check(model1.type === "bagged_positive_unlabeled_mature_sequence_model", "Modelo 1 declara ensemble PU da sequencia madura", model1.type);
  check(/PU|positive-unlabeled/i.test(model1.training_design ?? ""), "desenho do Modelo 1 explicita aprendizado Positive-Unlabeled", model1.training_design);
  check(model1.feature_scope?.excluded?.includes("precursor hairpin") && model1.feature_scope?.excluded?.includes("estrutura secundaria"), "hairpin e estrutura estao explicitamente fora do escopo ativo", model1.feature_scope?.excluded?.join(", "));
  check(modelWeightFeatures.every((feature) => feature.startsWith("mature:")), "todos os pesos do Modelo 1 pertencem a sequencia madura");
  check(validation?.primary_unit === "seed_family", "unidade primaria da validacao e familia de seed", validation?.primary_unit);
  check(validation?.method?.includes("full_unlabeled_background"), "validacao usa o background nao rotulado completo", validation?.method);
  check(folds.length === 5, "validacao externa possui 5 folds", folds.length);
  check(new Set(heldOutFamilies).size === validation?.seed_family_count && heldOutFamilies.length === validation?.seed_family_count, "cada familia de seed aparece uma unica vez nos folds externos", `${new Set(heldOutFamilies).size}/${heldOutFamilies.length}`);
  check(model1.hyperparameter_selection?.inner_folds === 3, "selecao interna possui 3 folds", model1.hyperparameter_selection?.inner_folds);
  check(configs.length >= 4, "grade aninhada possui multiplas configuracoes", configs.length);
  check(configs.some((config) => Math.max(...config.kValues) >= 6) && configs.some((config) => Math.max(...config.kValues) === 7), "grade avalia k-mers ate k=7");
  check(validation?.bootstrap_95_ci?.iterations >= 4000, "IC bootstrap usa pelo menos 4.000 repeticoes", validation?.bootstrap_95_ci?.iterations);
  check(validation?.random_ranking_test?.iterations >= 10000, "teste nulo usa pelo menos 10.000 repeticoes", validation?.random_ranking_test?.iterations);
  check(Object.keys(validation?.baselines ?? {}).length >= 4, "validacao inclui pelo menos quatro baselines", Object.keys(validation?.baselines ?? {}).join(", "));
  check(model1.pu_ensemble?.candidate_scoring?.includes("out-of-bag"), "candidatos nao rotulados sao pontuados somente fora dos bags em que serviram de contraste", model1.pu_ensemble?.candidate_scoring);
  check(model1.pu_ensemble?.out_of_bag_fallback_count === 0, "nenhum candidato precisou de fallback sem modelos out-of-bag", model1.pu_ensemble?.out_of_bag_fallback_count);
  check(model1.pu_ensemble?.bags >= 20, "ensemble final usa pelo menos 20 bags para estimar estabilidade", model1.pu_ensemble?.bags);
  check(Object.keys(model1.mature_feature_ablation?.representations ?? {}).length === 5, "ablacao compara cinco representacoes exclusivamente maduras", Object.keys(model1.mature_feature_ablation?.representations ?? {}).join(", "));
  check(Object.values(model1.mature_feature_ablation?.paired_comparisons_against_core ?? {}).every((item) => finiteUnit(item.paired_sign_flip_fdr_bh)), "ablacao corrige as quatro comparacoes contra o core por FDR BH");

  check(ranking1.length === model1.candidate_count, "quantidade do ranking do Modelo 1 confere com o JSON", `${ranking1.length}/${model1.candidate_count}`);
  check(new Set(ranking1.map((row) => row.mirna)).size === ranking1.length, "ranking do Modelo 1 nao possui miRNAs duplicados");
  check(ranksAreContiguous(ranking1, "rank"), "ranks do Modelo 1 sao contiguos");
  check(scoresAreDescending(ranking1, "score_modelo_sequencial"), "ranking do Modelo 1 esta ordenado por score decrescente");
  check(ranking1.every((row) => finiteUnit(row.score_modelo_sequencial) && finiteUnit(row.probabilidade_pu_consenso_bruta)), "scores do Modelo 1 sao finitos e pertencem a [0,1]");
  check(ranking1.every((row) => row.probabilidade_pu_consenso_bruta === row.probabilidade_contrastiva_bruta), "alias legado da probabilidade preserva o mesmo valor");
  check(ranking1.every((row) => Number(row.numero_modelos_oob) >= 1 && Number(row.numero_modelos_oob) <= model1.pu_ensemble.bags), "todo candidato registra quantidade valida de modelos out-of-bag");
  check(ranking1.filter((row) => row.tem_expressao_no_dataset === "sim").length === model1.candidate_count_with_expression_available, "contagem de candidatos com expressao confere", model1.candidate_count_with_expression_available);
  check(!Object.hasOwn(ranking1[0] ?? {}, "numero_hairpins_associados") && !Object.hasOwn(ranking1[0] ?? {}, "metodo_estrutura_hairpin"), "ranking ativo nao expoe colunas de hairpin ou estrutura");
  check(ranking1.every((row) => ["percentil_mediano_bags_oob", "percentil_q25_bags_oob", "percentil_q75_bags_oob", "frequencia_top_10_bags_oob"].every((column) => finiteUnit(row[column]))), "ranking do Modelo 1 registra estabilidade out-of-bag em [0,1]");
  check(ranking1.every((row) => row.features_modelo_mais_influentes === row.features_kmer_mais_influentes), "alias legado de features influentes preserva o mesmo valor");

  const model2 = JSON.parse(fs.readFileSync(FILES.model2, "utf8"));
  const ranking2 = readCsv(FILES.ranking2);
  const integrated = readCsv(FILES.integrated);
  const expectedMiRNAs = new Set(ranking1.filter((row) => row.tem_expressao_no_dataset === "sim").map((row) => row.mirna));
  check(model2.cross_validation_folds === 5, "Modelo 2 registra validacao cruzada de 5 folds", model2.cross_validation_folds);
  check(ranking2.length === model2.candidate_count && integrated.length === model2.candidate_count, "contagens dos dois rankings do Modelo 2 conferem", `${ranking2.length}/${integrated.length}/${model2.candidate_count}`);
  check(model2.candidate_count_from_sequence_ranking === ranking1.length, "Modelo 2 registra o ranking completo recebido", model2.candidate_count_from_sequence_ranking);
  check(ranking2.every((row) => expectedMiRNAs.has(row.mirna)) && new Set(ranking2.map((row) => row.mirna)).size === expectedMiRNAs.size, "Modelo 2 contem exatamente os candidatos com expressao do Modelo 1");
  check(ranksAreContiguous(ranking2, "rank_validacao_pacientes"), "ranking de validacao possui ranks contiguos");
  check(scoresAreDescending(ranking2, "score_validacao_pacientes"), "ranking de validacao esta ordenado por score decrescente");
  check(ranksAreContiguous(integrated, "rank_integrado"), "ranking integrado possui ranks contiguos");
  check(scoresAreDescending(integrated, "score_final_descoberta"), "ranking integrado esta ordenado por score decrescente");
  check(ranking2.every((row) => ["cv_oof_auc", "cv_oof_accuracy", "cv_oof_precision", "cv_oof_recall_sensibilidade", "cv_oof_specificity", "cv_oof_f1"].every((column) => finiteUnit(row[column]))), "metricas OOF do Modelo 2 pertencem a [0,1]");
  check(ranking2.every((row) => ["cv_oof_auc_ic95_inferior_aprox", "cv_oof_auc_ic95_superior_aprox", "cv_oof_auc_fdr_bh_aprox"].every((column) => finiteUnit(row[column]))), "Modelo 2 registra IC e FDR aproximados validos");
  const expressionGroups = new Map();
  for (const row of ranking2) {
    const values = expressionGroups.get(row.features_expressao) ?? [];
    values.push(Number(row.cv_oof_auc_fdr_bh_aprox));
    expressionGroups.set(row.features_expressao, values);
  }
  check(model2.statistical_inference?.unique_expression_hypothesis_count === expressionGroups.size, "Modelo 2 conta hipoteses de expressao unicas para FDR", `${model2.statistical_inference?.unique_expression_hypothesis_count}/${expressionGroups.size}`);
  check([...expressionGroups.values()].every((values) => new Set(values.map((value) => value.toPrecision(12))).size === 1), "candidatos que compartilham features recebem o mesmo FDR");
  check(ranking2.every((row) => Number(row.cv_oof_auc) >= 0.5 || Number(row.cv_oof_auc_fdr_bh_aprox) >= 0.05), "teste unilateral nao declara AUC abaixo do acaso significativa");
  check(integrated.every((row) => Number(row.rank_75_modelo1_25_modelo2) >= 1 && Number(row.rank_25_modelo1_75_modelo2) >= 1), "ranking integrado inclui analise de sensibilidade 75/25 e 25/75");
  check(integrated.some((row) => row.fronteira_pareto === "sim"), "ranking integrado identifica fronteira de Pareto");

  const externalPrimary = readCsv(FILES.externalPrimary);
  const externalCentered = readCsv(FILES.externalCentered);
  const primarySummary = JSON.parse(fs.readFileSync(FILES.externalPrimarySummary, "utf8"));
  const centeredSummary = JSON.parse(fs.readFileSync(FILES.externalCenteredSummary, "utf8"));
  const globalShift = JSON.parse(fs.readFileSync(FILES.globalShift, "utf8"));
  const primaryExact = new Set(externalPrimary.filter((row) => row.replicacao_madura_exata === "sim").map((row) => row.mirna));
  const centeredExact = new Set(externalCentered.filter((row) => row.replicacao_madura_exata === "sim").map((row) => row.mirna));
  const replicatedBoth = [...primaryExact].filter((mirna) => centeredExact.has(mirna));
  const practicalBoth = externalPrimary.filter((row) => row.resolucao_mapeamento === "miRNA_maduro_exato" && row.replicacao_magnitude_auc_0_60 === "sim" && externalCentered.some((centered) => centered.mirna === row.mirna && centered.replicacao_magnitude_auc_0_60 === "sim"));
  const primaryUnambiguous = new Set(externalPrimary.filter((row) => row.replicacao_madura_sem_ambiguidade_interna === "sim").map((row) => row.mirna));
  const centeredUnambiguous = new Set(externalCentered.filter((row) => row.replicacao_madura_sem_ambiguidade_interna === "sim").map((row) => row.mirna));
  const unambiguousBoth = [...primaryUnambiguous].filter((mirna) => centeredUnambiguous.has(mirna));
  const unambiguousPracticalBoth = externalPrimary.filter((row) => row.replicacao_madura_sem_ambiguidade_interna === "sim" && row.replicacao_magnitude_auc_0_60 === "sim" && externalCentered.some((centered) => centered.mirna === row.mirna && centered.replicacao_madura_sem_ambiguidade_interna === "sim" && centered.replicacao_magnitude_auc_0_60 === "sim"));

  check(primarySummary.samples?.total === 2549 && primarySummary.samples?.breastCancer === 1206 && primarySummary.samples?.nonCancerControls === 1343, "coorte externa TS registra 2.549 amostras e classes esperadas");
  check(primarySummary.samples?.overlapWithInternalIds === 0, "coorte externa nao reutiliza IDs da coorte interna", primarySummary.samples?.overlapWithInternalIds);
  check(primarySummary.coverage?.frozenCandidates === 611 && primarySummary.coverage?.matureExact === 579 && primarySummary.coverage?.familyProxy === 23 && primarySummary.coverage?.absent === 9, "cobertura externa do ranking congelado confere");
  check(externalPrimary.length === 602 && externalCentered.length === 602 && externalPrimary.length + primarySummary.coverage.absent === primarySummary.coverage.frozenCandidates, "analises externas preservam todos os 602 candidatos mapeados e registram os 9 ausentes no resumo", `${externalPrimary.length}/${externalCentered.length}+${primarySummary.coverage.absent}`);
  check(primaryExact.size === primarySummary.replication?.statisticallyReplicatedMatureExact && primaryExact.size === 255, "replicacoes maduras exatas da analise primaria conferem", primaryExact.size);
  check(centeredSummary.sampleCenter === "mean" && centeredExact.size === centeredSummary.replication?.statisticallyReplicatedMatureExact && centeredExact.size === 271, "sensibilidade centrada por amostra confere", centeredExact.size);
  check(replicatedBoth.length === 211, "intersecao conservadora de replicacoes nas duas analises confere", replicatedBoth.length);
  check(practicalBoth.length === 203, "intersecao madura exata com AUC >= 0,60 nas duas analises confere", practicalBoth.length);
  check(primaryUnambiguous.size === 27 && centeredUnambiguous.size === 28, "replicacoes exatas sem ambiguidade interna de braco conferem", `${primaryUnambiguous.size}/${centeredUnambiguous.size}`);
  check(unambiguousBoth.length === 22, "nucleo maduro estrito sem ambiguidade de braco nas duas analises confere", unambiguousBoth.length);
  check(unambiguousPracticalBoth.length === 21, "nucleo maduro estrito com AUC >= 0,60 nas duas analises confere", unambiguousPracticalBoth.length);
  check(globalShift.globalSampleMean?.aucCancerHigher > 0.9 && globalShift.featureMeanDirection?.proportionHigherInCancer > 0.9, "auditoria detecta e documenta forte deslocamento global", `${globalShift.globalSampleMean?.aucCancerHigher}/${globalShift.featureMeanDirection?.proportionHigherInCancer}`);
  check(Math.abs(primarySummary.rankingEvaluation?.spearmanInternalScoreVsExternalDirectionalAucMatureExact) < 0.1, "baixa correlacao ranking interno versus efeito externo permanece explicitamente quantificada", primarySummary.rankingEvaluation?.spearmanInternalScoreVsExternalDirectionalAucMatureExact);

  finish();
}

function finish() {
  const failures = checks.filter((item) => !item.ok);
  const lines = [
    "Auditoria automatizada do pipeline de descoberta de miRNA",
    "",
    `Resultado: ${failures.length ? "FALHOU" : "APROVADO"}`,
    `Verificacoes: ${checks.length}`,
    `Falhas: ${failures.length}`,
    "",
    ...checks.map((item) => `${item.ok ? "OK" : "FALHA"}\t${item.description}${item.detail !== "" && item.detail !== undefined ? `\t${item.detail}` : ""}`),
    "",
  ];
  fs.mkdirSync(path.dirname(FILES.report), { recursive: true });
  fs.writeFileSync(FILES.report, lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  if (failures.length) process.exitCode = 1;
}

main();
