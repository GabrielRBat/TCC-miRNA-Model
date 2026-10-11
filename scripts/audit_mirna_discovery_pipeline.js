const crypto = require("crypto");
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
  internalDataset: fromRoot("data", "processed", "dataset_mirna_balanceado_colunas_comuns.csv"),
  positiveMarkers: fromRoot("data", "external", "breast_cancer_mirna_positive_markers.csv"),
  trainingPolicy: fromRoot("data", "external", "breast_cancer_mirna_training_policy.csv"),
  matureFasta: fromRoot("data", "external", "mirbase_mature.fa"),
  externalMap: fromRoot("data", "processed", "gse73002_external_validation_ts_map.csv"),
  readme: fromRoot("README.md"),
  projectContext: fromRoot("context.md"),
  methodology: fromRoot("docs", "METODOLOGIA_MODELOS_MIRNA.md"),
  didacticGuide: fromRoot("docs", "GUIA_DIDATICO_PIPELINE_MIRNA.html"),
  dashboard: fromRoot("reports", "mirna_rankings_dashboard.html"),
  externalPreparationReport: fromRoot("reports", "gse73002_external_preparation_report.txt"),
  legacyBaselineReport: fromRoot("reports", "modelo_mirna_metricas.txt"),
  legacyPanelReport: fromRoot("reports", "modelo_mirna_painel_metricas.txt"),
  legacySequenceReport: fromRoot("reports", "mirna_sequence_candidate_discovery_report.txt"),
  legacyIntegratedReport: fromRoot("reports", "mirna_integrated_candidate_evidence_report.txt"),
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

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function normalizeMirnaName(value) {
  const lower = String(value ?? "").trim().toLowerCase();
  return lower.startsWith("hsa-") ? lower : /^(mir|let)-/.test(lower) ? `hsa-${lower}` : lower;
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

  const internalDataset = readCsv(FILES.internalDataset);
  const internalSampleIds = internalDataset.map((row) => row.sample_id);
  const internalClass0 = internalDataset.filter((row) => Number(row.classe) === 0);
  const internalClass1 = internalDataset.filter((row) => Number(row.classe) === 1);
  const internalFeatures = Object.keys(internalDataset[0] ?? {}).filter((column) => !["sample_id", "classe"].includes(column));
  const internalValuesValid = internalDataset.every((row) => internalFeatures.every((column) => Number.isFinite(Number(row[column])) && Number(row[column]) >= 0));
  const classSourceAligned = internalClass0.every((row) => /^GTEX-/i.test(row.sample_id)) && internalClass1.every((row) => !/^GTEX-/i.test(row.sample_id));
  check(internalDataset.length === 2678 && internalClass0.length === 1339 && internalClass1.length === 1339, "base interna possui 2.678 amostras balanceadas 1.339/1.339", `${internalDataset.length}/${internalClass0.length}/${internalClass1.length}`);
  check(internalFeatures.length === 371, "base interna comum possui 371 features de miRNA", internalFeatures.length);
  check(new Set(internalSampleIds.map((value) => value.toLowerCase())).size === internalSampleIds.length, "IDs da base interna sao unicos sem diferenciar maiusculas");
  check(internalValuesValid, "todas as expressoes da base interna sao numericas, finitas e nao negativas");
  check(classSourceAligned, "formatos de ID confirmam alinhamento estrutural entre classe e fonte na base interna");

  const positiveMarkers = readCsv(FILES.positiveMarkers);
  const trainingPolicy = readCsv(FILES.trainingPolicy);
  const positiveNames = positiveMarkers.map((row) => normalizeMirnaName(row.resolved_mature_mirna));
  const policyNames = trainingPolicy.map((row) => normalizeMirnaName(row.resolved_mature_mirna));
  const fastaNames = fs.readFileSync(FILES.matureFasta, "utf8").split(/\r?\n/).filter((line) => line.startsWith(">hsa-")).map((line) => normalizeMirnaName(line.slice(1).split(/\s+/, 1)[0]));
  const fastaSet = new Set(fastaNames);
  check(positiveMarkers.length === 43 && new Set(positiveNames).size === 43, "lista positiva possui 43 miRNAs maduros unicos");
  check(trainingPolicy.length === 43 && new Set(policyNames).size === 43 && policyNames.every((name) => positiveNames.includes(name)), "politica de treino cobre exatamente os 43 positivos");
  check(trainingPolicy.every((row) => row.use_in_training === "sim" && Number(row.training_weight) > 0), "todas as politicas ativas possuem peso positivo");
  check(fastaNames.length === 2656 && fastaSet.size === 2656, "FASTA contem 2.656 miRNAs humanos maduros unicos", fastaNames.length);
  check(positiveNames.every((name) => fastaSet.has(name)), "todos os 43 positivos resolvidos existem exatamente no FASTA maduro");
  check(model1.candidate_count + positiveMarkers.length === fastaNames.length, "universo do Modelo 1 particiona FASTA em positivos e 2.613 candidatos", `${model1.candidate_count}+${positiveMarkers.length}/${fastaNames.length}`);
  check(positiveMarkers.filter((row) => /shimomura/i.test(row.fonte)).length === 5, "dependencia bibliografica GSE73002 esta limitada e quantificada em cinco positivos");

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

  const externalMap = readCsv(FILES.externalMap);
  const externalMapCancer = externalMap.filter((row) => Number(row.classe) === 1 && row.diagnostico_geo === "breast cancer");
  const externalMapControls = externalMap.filter((row) => Number(row.classe) === 0 && row.diagnostico_geo === "non-cancer");
  check(externalMap.length === 2549 && externalMapCancer.length === 1206 && externalMapControls.length === 1343, "mapa externo rastreia exatamente casos e controles TS", `${externalMap.length}/${externalMapCancer.length}/${externalMapControls.length}`);
  check(externalMap.every((row) => row.coorte_original === "TS"), "mapa externo contem somente a divisao TS predefinida");
  check(new Set(externalMap.map((row) => row.sample_id)).size === externalMap.length && new Set(externalMap.map((row) => row.source_sample_id)).size === externalMap.length, "IDs GSM e IDs sinteticos do mapa externo sao unicos");
  check(primarySummary.provenanceSha256?.integratedRanking === sha256File(FILES.integrated), "hash do ranking congelado confere no resumo externo");
  check(primarySummary.provenanceSha256?.sequenceModel === sha256File(FILES.model1), "hash do Modelo 1 congelado confere no resumo externo");
  check(primarySummary.provenanceSha256?.patientModel === sha256File(FILES.model2), "hash do Modelo 2 congelado confere no resumo externo");
  check(JSON.stringify(primarySummary.provenanceSha256) === JSON.stringify(centeredSummary.provenanceSha256), "analises primaria e centrada usam os mesmos artefatos congelados");
  const optionalPreparedInput = fromRoot(...primarySummary.input.split("/"));
  if (fs.existsSync(optionalPreparedInput)) check(primarySummary.provenanceSha256?.inputCsv === sha256File(optionalPreparedInput), "hash da matriz externa local confere no resumo");

  const readme = fs.readFileSync(FILES.readme, "utf8");
  const methodology = fs.readFileSync(FILES.methodology, "utf8");
  const projectContext = fs.readFileSync(FILES.projectContext, "utf8");
  const didacticGuide = fs.readFileSync(FILES.didacticGuide, "utf8");
  const dashboard = fs.readFileSync(FILES.dashboard, "utf8");
  const portableTextArtifacts = [
    readme,
    projectContext,
    fs.readFileSync(FILES.externalPreparationReport, "utf8"),
    fs.readFileSync(FILES.legacyBaselineReport, "utf8"),
    fs.readFileSync(FILES.legacyPanelReport, "utf8"),
    fs.readFileSync(FILES.legacySequenceReport, "utf8"),
    fs.readFileSync(FILES.legacyIntegratedReport, "utf8"),
  ];
  check(/Fluxo científico vigente:[\s\S]*rastreabilidade histórica/i.test(readme), "README separa explicitamente fluxo vigente de artefatos historicos");
  check(!/Modelo principal recomendado:\s*```text\s*models\/modelo_mirna_painel\.json/i.test(projectContext), "contexto nao recomenda mais o painel historico como modelo principal");
  check(/Historico: Dois Modelos com Hairpin/i.test(projectContext) && /substituído em 10\/10\/2026/i.test(projectContext), "contexto marca inequivocamente a versao com hairpin como historica");
  check(/classe e (?:fonte|origem) est[aã]o estruturalmente confundidas/i.test(`${readme}\n${methodology}`), "documentacao declara confundimento estrutural da base interna");
  check(/núcleo maduro estrito possui 22|nucleo maduro estrito de 22/i.test(`${didacticGuide}\n${methodology}`), "guia e metodologia destacam o nucleo maduro estrito de 22");
  check((dashboard.match(/\"nucleo_estrito\":\"sim\"/g) ?? []).length === 44, "dashboard marca os 22 candidatos estritos nas duas abas", (dashboard.match(/\"nucleo_estrito\":\"sim\"/g) ?? []).length);
  check(/AUC 0[,.]971[\s\S]*95[,.]67%/i.test(`${readme}\n${didacticGuide}`), "documentacao exibe o alerta quantitativo de deslocamento global");
  check(portableTextArtifacts.every((content) => !/[A-Z]:\\Users\\/i.test(content)), "relatorios e instrucoes versionados nao dependem de caminho absoluto de usuario");

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
