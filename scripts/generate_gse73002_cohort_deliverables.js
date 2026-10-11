const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const FILES = {
  primarySummary: fromRoot("reports", "gse73002_ts_external_validation_summary.json"),
  centeredSummary: fromRoot("reports", "gse73002_ts_external_validation_centered_sensitivity_summary.json"),
  globalShift: fromRoot("reports", "gse73002_global_shift_audit.json"),
  primaryCsv: fromRoot("data", "processed", "gse73002_ts_external_validation.csv"),
  centeredCsv: fromRoot("data", "processed", "gse73002_ts_external_validation_centered_sensitivity.csv"),
  provenance: fromRoot("reports", "gse73002_provenance_check.txt"),
  metrics: fromRoot("reports", "metricas_coorte_externa_gse73002.csv"),
  explanation: fromRoot("docs", "EXPLICACAO_COORTE_EXTERNA_GSE73002.md"),
};

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else current += character;
    } else if (character === ",") { values.push(current); current = ""; }
    else if (character === '"') quoted = true;
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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function extractNumber(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`Nao foi possivel extrair ${label} do relatorio de proveniencia.`);
  return Number(match[1]);
}

function main() {
  for (const filePath of Object.values(FILES).slice(0, 6)) if (!fs.existsSync(filePath)) throw new Error(`Arquivo ausente: ${filePath}`);
  const primary = JSON.parse(fs.readFileSync(FILES.primarySummary, "utf8"));
  const centered = JSON.parse(fs.readFileSync(FILES.centeredSummary, "utf8"));
  const shift = JSON.parse(fs.readFileSync(FILES.globalShift, "utf8"));
  const primaryRows = readCsv(FILES.primaryCsv);
  const centeredRows = readCsv(FILES.centeredCsv);
  const provenance = fs.readFileSync(FILES.provenance, "utf8");
  const centeredByMirna = new Map(centeredRows.map((row) => [row.mirna, row]));
  const exactBoth = primaryRows.filter((row) => row.replicacao_madura_exata === "sim" && centeredByMirna.get(row.mirna)?.replicacao_madura_exata === "sim");
  const practicalBoth = exactBoth.filter((row) => row.replicacao_magnitude_auc_0_60 === "sim" && centeredByMirna.get(row.mirna)?.replicacao_magnitude_auc_0_60 === "sim");
  const strictBoth = exactBoth.filter((row) => row.replicacao_madura_sem_ambiguidade_interna === "sim" && centeredByMirna.get(row.mirna)?.replicacao_madura_sem_ambiguidade_interna === "sim");
  const strictPracticalBoth = strictBoth.filter((row) => row.replicacao_magnitude_auc_0_60 === "sim" && centeredByMirna.get(row.mirna)?.replicacao_magnitude_auc_0_60 === "sim");
  const top20Both = exactBoth.filter((row) => Number(row.rank_integrado_interno) <= 20);
  const strictOrdered = [...strictBoth].sort((left, right) => Number(left.rank_integrado_interno) - Number(right.rank_integrado_interno));
  const officialSamples = extractNumber(provenance, /Amostras na matriz oficial:\s*(\d+)/i, "amostras oficiais");
  const localSamples = extractNumber(provenance, /Amostras presentes no ZIP e conferidas:\s*(\d+)\/\d+/i, "amostras locais");
  const excludedSamples = extractNumber(
    provenance,
    /Amostras oficiais (?:nao incluidas no|deliberadamente ausentes do) ZIP:\s*(\d+)/i,
    "amostras excluidas",
  );
  const checkedCells = extractNumber(provenance, /Celulas numericas conferidas:\s*(\d+)\/\d+/i, "celulas conferidas");
  const maxDifference = Number((provenance.match(/Maior diferenca absoluta:\s*([0-9.]+)/i) ?? [])[1]);

  const metrics = [];
  const add = (section, metric, value, unit, analysis, interpretation) => metrics.push({ section, metric, value, unit, analysis, interpretation });
  add("identificacao", "acesso_geo", "GSE73002", "identificador", "proveniencia", "Identificador oficial da serie no NCBI GEO; nao e nome de um modelo.");
  add("proveniencia", "amostras_matriz_oficial", officialSamples, "amostras", "auditoria_oficial", "Total observado na matriz oficial do GEO.");
  add("proveniencia", "amostras_zip_recebido", localSamples, "amostras", "auditoria_oficial", "Subconjunto presente no ZIP usado pelo projeto.");
  add("proveniencia", "amostras_oficiais_nao_incluidas_zip", excludedSamples, "amostras", "auditoria_oficial", "93 de doenca prostatica no treino e 54 de doenca benigna da mama no teste.");
  add("proveniencia", "celulas_numericas_conferidas", checkedCells, "celulas", "auditoria_oficial", "Comparacao distribuida ZIP versus matriz oficial.");
  add("proveniencia", "maior_diferenca_absoluta", maxDifference, "unidade_log2", "auditoria_oficial", "Dentro da tolerancia de arredondamento local a quatro casas decimais.");
  add("coorte_primaria", "amostras_ts_total", primary.samples.total, "amostras", "principal", "Somente TS_B e TS_N.");
  add("coorte_primaria", "cancer_mama", primary.samples.breastCancer, "amostras", "principal", "Classe 1.");
  add("coorte_primaria", "controles_sem_cancer", primary.samples.nonCancerControls, "amostras", "principal", "Classe 0; doenca benigna da mama nao esta no ZIP.");
  add("coorte_primaria", "mirnas_medidos", primary.inputAudit.mirnaColumns, "miRNAs", "principal", "Valores log2 normalizados por quantis.");
  add("coorte_primaria", "ids_coincidentes_base_interna", primary.samples.overlapWithInternalIds, "IDs", "principal", "Zero coincidencias literais; nao comprova sozinho independencia no nivel de pessoa.");
  add("cobertura", "candidatos_congelados", primary.coverage.frozenCandidates, "candidatos", "principal", "Ranking recebido sem retreino.");
  add("cobertura", "mapeamento_maduro_exato", primary.coverage.matureExact, "candidatos", "principal", "Desfecho de mapeamento primario.");
  add("cobertura", "proxy_familia", primary.coverage.familyProxy, "candidatos", "principal", "Resultado secundario; nao somado silenciosamente aos exatos.");
  add("cobertura", "ausentes", primary.coverage.absent, "candidatos", "principal", "Nao avaliados na coorte.");
  add("cobertura", "hipoteses_externas_distintas", primary.coverage.distinctExternalHypotheses, "hipoteses", "principal", "Quantidade usada na correcao FDR BH.");
  add("resultado_principal", "direcao_concordante", primary.replication.directionConcordant, "candidatos_mapeados", "principal", "Direcao externa igual a direcao interna congelada.");
  add("resultado_principal", "sinais_reproduzidos_todos_mapeamentos", primary.replication.statisticallyReplicatedAllMappings, "candidatos", "principal", "Inclui exatos e proxies.");
  add("resultado_principal", "replicacoes_maduras_exatas", primary.replication.statisticallyReplicatedMatureExact, "candidatos", "principal", "Direcao concordante, IC95% da AUC acima de 0,5 e FDR abaixo de 0,05.");
  add("resultado_principal", "replicacoes_exatas_auc_ge_060", primary.replication.practicalAucAtLeast060MatureExact, "candidatos", "principal", "Filtro descritivo de magnitude; nao e limiar clinico.");
  add("resultado_principal", "replicacoes_exatas_sem_ambiguidade_interna", primary.replication.statisticallyReplicatedMatureExactWithoutInternalArmAmbiguity, "candidatos", "principal", "Exclui candidatos cuja evidência interna compartilhava feature entre bracos.");
  for (const item of primary.rankingEvaluation.topK) add("resultado_principal", `top_${item.limit}_reproduzidos`, item.statisticallyReplicated, `de_${item.exactCandidatesFound}_encontrados`, "principal", "Somente correspondencia madura exata.");
  add("resultado_principal", "spearman_score_interno_auc_externa", primary.rankingEvaluation.spearmanInternalScoreVsExternalDirectionalAucMatureExact, "rho", "principal", "Associacao global baixa entre ordem interna e magnitude externa.");
  add("deslocamento_global", "auc_media_global_amostra", shift.globalSampleMean.aucCancerHigher, "AUC", "auditoria", "A media dos 2.540 miRNAs separa fortemente as classes.");
  add("deslocamento_global", "mirnas_media_maior_cancer", shift.featureMeanDirection.higherInCancer, `de_${shift.mirnaColumns}`, "auditoria", "Predominio quase universal da mesma direcao.");
  add("deslocamento_global", "proporcao_media_maior_cancer", shift.featureMeanDirection.proportionHigherInCancer, "proporcao", "auditoria", "Motivou a sensibilidade centrada pos-hoc.");
  add("sensibilidade_centrada", "replicacoes_maduras_exatas", centered.replication.statisticallyReplicatedMatureExact, "candidatos", "pos_hoc", "Valores log2 menos a media de cada amostra.");
  add("sensibilidade_centrada", "replicacoes_exatas_auc_ge_060", centered.replication.practicalAucAtLeast060MatureExact, "candidatos", "pos_hoc", "Filtro descritivo de magnitude.");
  add("sensibilidade_centrada", "replicacoes_exatas_sem_ambiguidade_interna", centered.replication.statisticallyReplicatedMatureExactWithoutInternalArmAmbiguity, "candidatos", "pos_hoc", "Resultado centrado sem ambiguidade interna de braco.");
  add("sensibilidade_centrada", "spearman_score_interno_auc_externa", centered.rankingEvaluation.spearmanInternalScoreVsExternalDirectionalAucMatureExact, "rho", "pos_hoc", "A ordenacao completa nao acompanha a magnitude centrada.");
  add("convergencia", "replicacoes_exatas_nas_duas_analises", exactBoth.length, "candidatos", "intersecao", "Conjunto amplo concordante principal mais centrada.");
  add("convergencia", "replicacoes_exatas_auc_ge_060_nas_duas", practicalBoth.length, "candidatos", "intersecao", "Intersecao ampla com magnitude descritiva.");
  add("convergencia", "nucleo_maduro_estrito", strictBoth.length, "candidatos", "intersecao", "Sem ambiguidade interna de braco nas duas analises.");
  add("convergencia", "nucleo_estrito_auc_ge_060_nas_duas", strictPracticalBoth.length, "candidatos", "intersecao", "Subconjunto mais rigoroso com magnitude descritiva.");
  add("convergencia", "top_20_reproduzidos_nas_duas", top20Both.length, "candidatos", "intersecao", "Concordancia no topo do ranking congelado.");
  add("criterios", "minimo_amostras_por_classe", primary.criteria.minimumSamplesPerClass, "amostras", "principal", "Piso tecnico, nao calculo de poder.");
  add("criterios", "limite_inferior_ic_auc", `>${primary.criteria.directionalAucCiLowerGreaterThan}`, "AUC", "principal", "Criterio de reproducao estatistica.");
  add("criterios", "fdr_bh", `<${primary.criteria.fdrBhLessThan}`, "FDR", "principal", "Criterio de reproducao estatistica.");
  add("criterios", "auc_magnitude_descritiva", `>=${primary.criteria.practicalDirectionalAucAtLeast}`, "AUC", "principal", "Nao representa utilidade clinica.");
  add("dependencia", "positivos_modelo1_ligados_gse73002", 5, "de_43_positivos", "limitacao", "Dependencia bibliografica indireta; os cinco nao sao candidatos testados.");

  const metricHeader = ["secao", "metrica", "valor", "unidade", "analise", "interpretacao"];
  const metricRows = metrics.map((item) => [item.section, item.metric, item.value, item.unit, item.analysis, item.interpretation]);
  fs.mkdirSync(path.dirname(FILES.metrics), { recursive: true });
  fs.writeFileSync(FILES.metrics, [metricHeader, ...metricRows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n", "utf8");

  const strictNames = strictOrdered.map((row) => `\`${row.mirna}\``).join(", ");
  const explanation = `# Coorte externa de validacao em soro — GEO GSE73002

## Resposta curta

A GSE73002 nao e um terceiro modelo. O pipeline de aprendizado termina no Modelo 2. Depois disso, o ranking final e congelado e levado a uma base externa para verificar se os sinais aparecem novamente sem retreinar, trocar direcoes ou escolher novos candidatos.

\`\`\`text
Modelo 1 -> Modelo 2 -> ranking final congelado
                                  |
                                  v
              avaliacao externa GSE73002 (sem aprendizado)
\`\`\`

O nome amigavel usado no projeto e **coorte externa de validacao em soro**. \`GSE73002\` deve permanecer porque e o identificador oficial da serie no NCBI GEO: <https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE73002>.

## O que foi recebido e o que existe na fonte oficial

A matriz oficial conferida possui ${officialSamples.toLocaleString("pt-BR")} amostras. O ZIP recebido possui ${localSamples.toLocaleString("pt-BR")} amostras de cancer de mama ou controles sem cancer. A auditoria identificou ${excludedSamples} amostras oficiais que nao estao no ZIP: 93 de doenca prostatica do grupo de treino e 54 de doenca benigna da mama do grupo de teste.

Essa diferenca nao altera o contraste principal predefinido, que usa somente \`TS_B\` e \`TS_N\`. Entretanto, ela limita a pergunta: esta analise testa cancer de mama contra controles sem cancer; ela **nao testa especificidade contra doenca benigna da mama**.

A proveniencia foi ampliada para todos os ${localSamples.toLocaleString("pt-BR")} metadados locais e uma amostra distribuida de ${checkedCells} celulas numericas. Todas coincidiram com a matriz oficial dentro da tolerancia de arredondamento; a maior diferenca absoluta foi ${maxDifference.toFixed(9)}.

## Coorte usada na analise principal

| Grupo | Amostras |
|---|---:|
| Cancer de mama — \`TS_B\` | ${primary.samples.breastCancer.toLocaleString("pt-BR")} |
| Controles sem cancer — \`TS_N\` | ${primary.samples.nonCancerControls.toLocaleString("pt-BR")} |
| Total | ${primary.samples.total.toLocaleString("pt-BR")} |

Todas sao amostras de soro medidas na plataforma do estudo, com ${primary.inputAudit.mirnaColumns.toLocaleString("pt-BR")} miRNAs em valores log2 normalizados por quantis. Nao foi aplicado um segundo logaritmo.

Nao houve coincidencia literal entre os IDs GSM externos e os IDs internos. Como as bases usam sistemas de identificacao diferentes, isso comprova ausencia de IDs repetidos, mas nao e, sozinho, prova documental de independencia no nivel da pessoa. A origem externa distinta e o tipo de amostra tornam sobreposicao improvavel, mas um cruzamento individual exigiria uma chave comum que o repositorio nao possui.

## O que ficou congelado

Antes da avaliacao externa foram congelados:

- os ${primary.coverage.frozenCandidates} candidatos;
- a ordem do ranking integrado;
- a direcao esperada de expressao;
- os pesos e hiperparametros dos Modelos 1 e 2;
- os criterios estatisticos;
- os hashes dos modelos, ranking e matriz preparada.

A coorte externa nao altera nenhum desses elementos. Ela calcula novas metricas de avaliacao para a lista pronta.

## Cobertura dos candidatos

| Situacao | Quantidade | Uso |
|---|---:|---|
| miRNA maduro exato | ${primary.coverage.matureExact} | resultado primario |
| proxy de familia/precursor | ${primary.coverage.familyProxy} | evidencia secundaria |
| ausente | ${primary.coverage.absent} | nao avaliado |
| hipoteses externas distintas | ${primary.coverage.distinctExternalHypotheses} | base da correcao FDR |

Proxy nunca e somado silenciosamente ao total de miRNAs maduros exatos.

## Criterio de reproducao

Um sinal e marcado como reproduzido quando:

1. existem pelo menos ${primary.criteria.minimumSamplesPerClass} amostras em cada classe;
2. a direcao observada concorda com a direcao interna congelada;
3. o limite inferior aproximado do IC95% da AUC direcional e maior que ${primary.criteria.directionalAucCiLowerGreaterThan};
4. o FDR Benjamini-Hochberg e menor que ${primary.criteria.fdrBhLessThan}.

AUC direcional de pelo menos ${primary.criteria.practicalDirectionalAucAtLeast} e apresentada apenas como filtro descritivo de magnitude. Nao e um limiar de uso clinico.

## Resultado principal

| Metrica | Resultado | Leitura correta |
|---|---:|---|
| Replicacoes maduras exatas | ${primary.replication.statisticallyReplicatedMatureExact} | atendem ao criterio estatistico predefinido |
| Exatas com AUC >= 0,60 | ${primary.replication.practicalAucAtLeast060MatureExact} | filtro adicional de magnitude |
| Exatas sem ambiguidade interna de braco | ${primary.replication.statisticallyReplicatedMatureExactWithoutInternalArmAmbiguity} | evidencia interna mais especifica para 5p/3p |
| Top 10 reproduzidos | ${primary.rankingEvaluation.topK[0].statisticallyReplicated}/${primary.rankingEvaluation.topK[0].exactCandidatesFound} | concentracao no topo |
| Top 20 reproduzidos | ${primary.rankingEvaluation.topK[1].statisticallyReplicated}/${primary.rankingEvaluation.topK[1].exactCandidatesFound} | um candidato estava ausente |
| Spearman score interno x AUC externa | ${primary.rankingEvaluation.spearmanInternalScoreVsExternalDirectionalAucMatureExact.toFixed(4)} | baixa concordancia da ordenacao completa |

## Controle de deslocamento global

A media global dos ${shift.mirnaColumns.toLocaleString("pt-BR")} miRNAs por amostra separou as classes com AUC ${shift.globalSampleMean.aucCancerHigher.toFixed(3)}. Alem disso, ${shift.featureMeanDirection.higherInCancer.toLocaleString("pt-BR")}/${shift.mirnaColumns.toLocaleString("pt-BR")} (${(100 * shift.featureMeanDirection.proportionHigherInCancer).toFixed(2)}%) dos miRNAs tiveram media maior no grupo cancer.

Esse padrao mostra uma forte componente global de coorte/processamento. Portanto, as ${primary.replication.statisticallyReplicatedMatureExact} replicacoes principais nao devem ser chamadas de ${primary.replication.statisticallyReplicatedMatureExact} biomarcadores confirmados.

## Sensibilidade centrada pos-hoc

Depois de observar o deslocamento, foi executada uma analise de sensibilidade que subtrai a media dos ${shift.mirnaColumns.toLocaleString("pt-BR")} miRNAs de cada amostra. Ela nao retreina os modelos, mas foi decidida apos o resultado e, por isso, permanece rotulada como pos-hoc.

| Convergencia | Quantidade |
|---|---:|
| Replicacoes exatas na analise principal | ${primary.replication.statisticallyReplicatedMatureExact} |
| Replicacoes exatas na sensibilidade centrada | ${centered.replication.statisticallyReplicatedMatureExact} |
| Replicacoes exatas presentes nas duas | ${exactBoth.length} |
| Presentes nas duas e AUC >= 0,60 nas duas | ${practicalBoth.length} |
| Nucleo maduro estrito sem ambiguidade nas duas | ${strictBoth.length} |
| Nucleo estrito com AUC >= 0,60 nas duas | ${strictPracticalBoth.length} |
| Candidatos do top 20 reproduzidos nas duas | ${top20Both.length} |

Os ${strictBoth.length} candidatos do nucleo estrito, na ordem do ranking interno, sao: ${strictNames}.

## Hierarquia correta da evidencia

1. **${primary.replication.statisticallyReplicatedMatureExact}**: resultado principal maduro exato, mas exposto ao deslocamento global.
2. **${exactBoth.length}**: sinais concordantes entre o principal e a sensibilidade centrada.
3. **${strictBoth.length}**: nucleo mais rigoroso para afirmacoes sobre miRNA maduro, sem ambiguidade interna de braco nas duas analises.
4. **${strictPracticalBoth.length}**: subconjunto estrito que tambem manteve AUC direcional >= 0,60 nas duas analises.

Para a apresentacao, o conjunto de ${strictBoth.length} deve ser o destaque conservador. Nenhum desses numeros equivale a confirmacao clinica.

## Limitacoes obrigatorias

- cinco dos 43 positivos do Modelo 1 vieram da publicacao associada a GSE73002; e uma dependencia bibliografica indireta;
- a matriz recebida nao inclui as 54 amostras de doenca benigna da mama do teste oficial;
- ha forte deslocamento global entre as classes;
- a correlacao entre score interno e magnitude externa e baixa;
- a checagem de IDs nao comprova sozinha independencia por pessoa;
- e apenas uma coorte externa;
- nao houve validacao laboratorial ou clinica.

## O que pode ser afirmado

> O ranking congelado produzido pelos dois modelos foi avaliado sem retreinamento em uma coorte externa de soro. A analise encontrou um conjunto de ${exactBoth.length} sinais maduros concordantes entre o resultado principal e uma sensibilidade centrada; o nucleo mais rigoroso contem ${strictBoth.length} candidatos sem ambiguidade interna de braco.

## O que nao pode ser afirmado

> A GSE73002 treinou um terceiro modelo, confirmou ${primary.replication.statisticallyReplicatedMatureExact} biomarcadores ou demonstrou desempenho clinico do pipeline.

## Arquivos e reproducao

- metricas consolidadas: \`reports/metricas_coorte_externa_gse73002.csv\`;
- plano predefinido: \`docs/PLANO_VALIDACAO_EXTERNA_GSE73002.md\`;
- sensibilidade: \`docs/ANALISE_SENSIBILIDADE_GSE73002.md\`;
- proveniencia oficial: \`reports/gse73002_provenance_check.txt\`;
- resultados completos: \`data/processed/gse73002_ts_external_validation*.csv\`;
- resumos: \`reports/gse73002_ts_external_validation*_summary.json\`.

Geracao deste documento e do CSV consolidado:

\`\`\`powershell
node scripts\\generate_gse73002_cohort_deliverables.js
\`\`\`
`;
  fs.mkdirSync(path.dirname(FILES.explanation), { recursive: true });
  fs.writeFileSync(FILES.explanation, explanation, "utf8");
  console.log(`Metricas geradas: ${path.relative(ROOT, FILES.metrics)}`);
  console.log(`Explicacao gerada: ${path.relative(ROOT, FILES.explanation)}`);
}

main();
