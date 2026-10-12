param(
  [string]$InputPath,
  [string]$OutputPath,
  [string]$PdfPath,
  [string]$ReportPath
)

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $InputPath) { $InputPath = Join-Path $projectRoot 'TCC_Predicao_Marcadores_Geneticos_Cancer_Mama.docx' }
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot 'TCC_Predicao_Marcadores_Geneticos_Cancer_Mama_ATUALIZADO.docx' }
if (-not $PdfPath) { $PdfPath = Join-Path $projectRoot 'TCC_Predicao_Marcadores_Geneticos_Cancer_Mama_ATUALIZADO.pdf' }
if (-not $ReportPath) { $ReportPath = Join-Path $projectRoot 'reports\tcc_document_update_report.txt' }

$inputResolved = (Resolve-Path -LiteralPath $InputPath).Path
$outputResolved = [System.IO.Path]::GetFullPath($OutputPath)
$pdfResolved = [System.IO.Path]::GetFullPath($PdfPath)
$reportResolved = [System.IO.Path]::GetFullPath($ReportPath)
$architectureFigure = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'docs\figures\tcc_architecture_current.png')).Path
$pipelineFigure = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'docs\figures\tcc_pipeline_current.png')).Path

$updates = [ordered]@{
  20 = "DESCOBERTA E PRIORIZAÇÃO COMPUTACIONAL DE BIOMARCADORES DE MICRORNA ASSOCIADOS AO CÂNCER DE MAMA"
  48 = "DESCOBERTA E PRIORIZAÇÃO COMPUTACIONAL DE BIOMARCADORES DE MICRORNA ASSOCIADOS AO CÂNCER DE MAMA"

  73 = "Este trabalho apresenta um pipeline computacional exploratório para descoberta e priorização de microRNAs (miRNAs) maduros potencialmente associados ao câncer de mama. A pesquisa não propõe um diagnóstico clínico. Seu objetivo é aprender padrões de sequência a partir de 43 miRNAs positivos conhecidos, ranquear o universo humano maduro do miRBase e verificar se os candidatos priorizados também apresentam associação de expressão em uma base interna de pacientes e em uma coorte externa de soro."
  74 = "O Modelo 1 utiliza aprendizado Positive-Unlabeled por bagging, representações exclusivamente da sequência madura — incluindo k-mers, região seed, composição e posição — e validação aninhada por família de seed. O Modelo 2 avalia, com predições out-of-fold, a associação interna entre a expressão de 611 candidatos e as classes disponíveis. Os dois escores formam um ranking integrado, posteriormente congelado e aplicado sem retreinamento à coorte externa GEO GSE73002, composta no contraste principal por 1.206 amostras de câncer de mama e 1.343 controles sem câncer."
  75 = "O Modelo 1 alcançou percentil médio de 64,60% por família de seed (IC95%: 55,85%–72,85%; p=0,0008), embora o Recall@10% de 12,50% não tenha sido significativo (p=0,2417). Na avaliação externa, 579 dos 611 candidatos tiveram correspondência madura exata; 255 atenderam ao critério estatístico predefinido e 7 dos 10 primeiros do ranking reproduziram. Uma auditoria identificou forte deslocamento global na coorte. A interseção entre a análise principal e uma sensibilidade centrada pós-hoc reuniu 211 sinais, dos quais 22 formam o núcleo maduro mais rigoroso, sem ambiguidade interna de braço. Esses resultados priorizam hipóteses para investigação; não confirmam biomarcadores nem utilidade clínica."
  76 = "Palavras-chave: microRNA; câncer de mama; descoberta de biomarcadores; aprendizado Positive-Unlabeled; validação externa."

  80 = "This study presents an exploratory computational pipeline for discovering and prioritizing mature microRNAs (miRNAs) potentially associated with breast cancer. The research does not propose a clinical diagnostic tool. Its objective is to learn sequence patterns from 43 known positive miRNAs, rank the mature human miRBase universe, and determine whether prioritized candidates also show expression associations in an internal patient dataset and in an external serum cohort."
  81 = "Model 1 applies bagged Positive-Unlabeled learning, mature-sequence-only representations — including k-mers, seed region, composition, and positional features — and nested validation grouped by seed family. Model 2 uses out-of-fold predictions to evaluate the internal association between the expression of 611 candidates and the available classes. Both scores form an integrated ranking, which was then frozen and applied without retraining to the GEO GSE73002 external cohort, using 1,206 breast cancer serum samples and 1,343 non-cancer controls in the primary comparison."
  82 = "Model 1 achieved a mean seed-family percentile of 64.60% (95% CI: 55.85%–72.85%; p=0.0008), whereas its 12.50% Recall@10% was not statistically significant (p=0.2417). In the external evaluation, 579 of 611 candidates had exact mature-miRNA matches; 255 met the prespecified statistical criterion, and 7 of the top 10 ranking candidates replicated. A global-shift audit identified a strong cohort-wide intensity component. The intersection between the primary analysis and a post-hoc sample-centered sensitivity analysis comprised 211 signals, including a stricter mature-miRNA core of 22 candidates without internal arm ambiguity. These findings prioritize research hypotheses; they do not establish biomarkers or clinical utility."
  83 = "Keywords: microRNA; breast cancer; biomarker discovery; Positive-Unlabeled learning; external validation."

  109 = "O câncer de mama permanece entre as neoplasias de maior impacto sobre a saúde das mulheres. O rastreamento e o diagnóstico em tempo oportuno influenciam diretamente as possibilidades terapêuticas e o prognóstico, mas métodos computacionais baseados em biomarcadores moleculares ainda precisam demonstrar robustez, reprodutibilidade e generalização antes de qualquer aplicação clínica. Nesse contexto, a bioinformática pode contribuir principalmente para organizar evidências e priorizar hipóteses experimentais."
  110 = "Os microRNAs são pequenas moléculas de RNA não codificante, geralmente com cerca de 22 nucleotídeos na forma madura, que regulam a expressão gênica em nível pós-transcricional. Alterações em seus níveis podem acompanhar processos relacionados à carcinogênese, e sua estabilidade em fluidos corporais favorece estudos de biópsia líquida. Entretanto, resultados entre estudos variam conforme população, material biológico, plataforma, normalização e desenho experimental, exigindo cautela na transferência de assinaturas moleculares (CARDINALI et al., 2022)."
  111 = "Estudos com miRNAs circulantes demonstram potencial para detectar câncer de mama, mas também evidenciam heterogeneidade e risco de superestimação. Shimomura et al. (2016), estudo associado à série GEO GSE73002, avaliaram milhares de amostras séricas e propuseram combinações de miRNAs para detecção precoce. Revisões e metanálises posteriores reforçam o potencial da área e, simultaneamente, apontam diferenças de protocolo, composição das coortes e validação como fontes de resultados divergentes (GARRIDO-PALACIOS et al., 2023)."
  112 = "Diante disso, este trabalho desenvolve um pipeline de descoberta e priorização, e não um classificador clínico final. O Modelo 1 aprende padrões exclusivamente de sequências maduras a partir de 43 marcadores positivos conhecidos e ranqueia 2.613 miRNAs não rotulados. O Modelo 2 acrescenta evidência de associação de expressão para os 611 candidatos presentes na base interna. O ranking combinado é então avaliado, sem retreinamento, em uma coorte externa de soro."
  113 = "O uso da sequência madura mantém o foco biológico nos miRNAs efetivamente funcionais. Foram avaliados k-mers, seed, comprimento, conteúdo GC, composição, entropia, posição e motivos terminais. Hairpin precursor, energia livre e estrutura secundária foram deliberadamente excluídos do pipeline vigente para reduzir a complexidade e impedir que a pergunta do TCC se afastasse do miRNA maduro."
  114 = "A hipótese de pesquisa é que padrões da sequência madura presentes em miRNAs associados ao câncer de mama podem concentrar outros candidatos relevantes no ranking e que parte desses candidatos também apresentará associação de expressão concordante. A hipótese é avaliada por validação aninhada, comparação com rankings nulos, análise interna out-of-fold e teste externo congelado. Mesmo quando convergentes, os resultados são interpretados como evidência computacional para priorização, não como causalidade, diagnóstico ou validação clínica."

  117 = "O câncer de mama apresenta elevada incidência e mortalidade no Brasil, e a pesquisa de biomarcadores pode contribuir para compreender mecanismos moleculares e orientar estudos futuros. Essa contribuição, contudo, deve ser separada de promessas de substituição da mamografia ou de aplicação assistencial imediata. Uma assinatura computacional somente pode ser considerada clinicamente útil depois de replicação independente, validação laboratorial, calibração, análise de poder e avaliação em diagnósticos diferenciais."
  118 = "A justificativa científica do projeto está na necessidade de reduzir o espaço de busca entre milhares de miRNAs maduros. Em vez de tratar todo miRNA fora da lista de referência como negativo, o Modelo 1 emprega aprendizado Positive-Unlabeled, apropriado quando existem positivos confiáveis e um universo não rotulado que pode conter novos positivos. A separação por família de seed também reduz a possibilidade de que sequências muito aparentadas apareçam simultaneamente no treino e na validação."
  119 = "A contribuição tecnológica consiste em um pipeline reprodutível que integra evidência de sequência madura, associação interna de expressão e avaliação externa congelada. O valor do trabalho está no ranking transparente, nos testes de sensibilidade, na documentação das limitações e na geração de hipóteses auditáveis. O projeto é voltado à pesquisa acadêmica e não deve ser apresentado como produto diagnóstico, dispositivo médico ou modelo pronto para uso em pacientes."

  124 = "Desenvolver e avaliar um pipeline computacional reprodutível para descobrir, ranquear e testar externamente candidatos maduros de miRNA associados ao câncer de mama, integrando padrões de sequência e evidência de expressão sem interpretar o resultado como diagnóstico clínico."
  126 = "Realizar revisão bibliográfica e curadoria de miRNAs maduros associados ao câncer de mama, registrando fontes, nomes resolvidos e pesos de treinamento;"
  127 = "Representar sequências maduras por k-mers, seed, composição e atributos posicionais, excluindo hairpin e estrutura secundária do escopo ativo;"
  128 = "Treinar um modelo Positive-Unlabeled com bagging e pontuação out-of-bag para ranquear miRNAs não rotulados, utilizando validação aninhada por família de seed;"
  129 = "Avaliar, no Modelo 2, a associação interna da expressão dos candidatos disponíveis por validação cruzada out-of-fold, efeitos, intervalos de confiança e FDR;"
  130 = "Integrar os escores dos dois modelos, analisar a sensibilidade aos pesos e congelar candidatos, direções e critérios antes da avaliação externa;"
  131 = "Testar o ranking congelado na coorte externa GSE73002, quantificando cobertura, concordância direcional, AUC, FDR, deslocamento global e robustez entre análises."

  134 = "A revisão bibliográfica concentra-se em miRNAs, câncer de mama, biomarcadores circulantes e métodos computacionais de priorização. A forma madura do miRNA é a unidade funcional utilizada neste projeto; embora o precursor hairpin participe da biogênese, ele não integra as features do pipeline. As sequências humanas maduras foram obtidas do miRBase, base de referência para nomenclatura e sequências de miRNAs (KOZOMARA; BIRGAOANU; GRIFFITHS-JONES, 2019)."
  135 = "A literatura relata miRNAs circulantes potencialmente associados a diagnóstico, prognóstico e características tumorais. Contudo, painéis diferentes nem sempre se reproduzem entre soro, plasma e tecido, e diferenças de plataforma ou normalização podem gerar deslocamentos sistemáticos. Por isso, significância estatística em uma única base não basta: direção, magnitude, incerteza, correção para múltiplos testes e avaliação externa precisam ser examinadas conjuntamente."
  136 = "No componente computacional, o problema é mais próximo de descoberta do que de classificação supervisionada convencional: existem positivos descritos na literatura, mas os demais miRNAs não podem ser assumidos como negativos. O aprendizado Positive-Unlabeled oferece um enquadramento mais adequado, enquanto a separação por família de seed, a pontuação out-of-bag e o congelamento anterior ao teste externo reduzem formas específicas de vazamento e ajuste pós-resultado."

  139 = "Esta seção apresenta trabalhos que fundamentam o uso de miRNAs circulantes e, ao mesmo tempo, demonstram por que a validação externa e o controle de limitações são necessários. A comparação com a literatura orientou a curadoria dos positivos, mas a recorrência bibliográfica não participa diretamente do score integrado vigente."
  140 = "Shimomura et al. (2016) investigaram combinações de miRNAs séricos para detecção de câncer de mama em grande número de amostras e disponibilizaram os dados associados à série GSE73002. O estudo fornece a base externa utilizada neste TCC. Cinco dos 43 positivos curados pelo projeto também vieram dessa publicação, criando dependência bibliográfica indireta que foi mantida explicitamente como limitação."
  141 = "Garrido-Palacios et al. (2023) realizaram revisão sistemática e metanálise sobre desregulação de miRNAs no diagnóstico precoce do câncer de mama. O trabalho reforça o potencial dos miRNAs e evidencia heterogeneidade entre estudos, incluindo diferenças de amostra, plataforma e composição dos painéis. Esses fatores justificam evitar a interpretação de uma única coorte como confirmação definitiva."
  142 = "Cardinali et al. (2022) revisaram o uso de miRNAs circulantes no diagnóstico e prognóstico do câncer de mama. A estabilidade dessas moléculas em fluidos corporais favorece a investigação minimamente invasiva, porém etapas pré-analíticas e analíticas podem alterar os níveis medidos. No presente projeto, essa observação fundamenta a distinção entre sinal biológico e deslocamento técnico de coorte."
  143 = "Adam-Artigues et al. (2021) propuseram uma assinatura plasmática de dois miRNAs voltada à detecção muito precoce. O estudo ilustra o valor de painéis compactos, mas também mostra que resultados dependem do contexto experimental e do material biológico. Assim, achados em plasma, soro e tecido não devem ser tratados como diretamente intercambiáveis."
  144 = "Kim et al. (2024) analisaram assinaturas de miRNAs em vesículas extracelulares derivadas de tumores, mostrando que o compartimento biológico de medição influencia a informação capturada. Essa diversidade de abordagens reforça que uma ferramenta exploratória deve preservar a rastreabilidade da origem dos dados e declarar incompatibilidades de material e tecnologia."
  145 = "Em síntese, a literatura sustenta o potencial dos miRNAs, mas não elimina riscos de heterogeneidade, lote, seleção de variáveis e sobreajuste. A contribuição deste projeto é combinar aprendizado de padrões maduros, triagem interna e avaliação externa congelada em um fluxo auditável. O objetivo não é superar estudos clínicos existentes, e sim produzir uma lista priorizada e cientificamente qualificável para investigações posteriores."

  148 = "Quanto à natureza, trata-se de pesquisa aplicada, quantitativa, exploratória e computacional, conduzida retrospectivamente com dados secundários. O estudo desenvolve e avalia métodos de priorização de hipóteses, sem intervenção em participantes, coleta prospectiva ou validação clínica. A reprodutibilidade é apoiada por scripts, artefatos versionados, hashes e auditorias automatizadas."
  149 = "De forma complementar, o trabalho incorpora pesquisa bibliográfica para curar os marcadores positivos, contextualizar a biologia dos miRNAs e interpretar os candidatos. A literatura não é utilizada como um terceiro score no ranking atual; seu papel é definir referências de treinamento, apoiar a discussão e evitar afirmações incompatíveis com o estado da evidência."
  150 = "O objeto de pesquisa é um pipeline com duas etapas de modelagem: o Modelo 1 aprende padrões da sequência madura e ranqueia miRNAs não rotulados; o Modelo 2 acrescenta associação interna de expressão aos candidatos disponíveis. O ranking integrado é avaliado posteriormente em uma coorte externa distinta, sem retreinamento."

  154 = "A população de interesse é formada por pessoas com câncer de mama e controles sem câncer representados em bases moleculares secundárias. A base interna contém 2.678 registros balanceados: 1.339 amostras de classe 1 oriundas de um CSV de quantificação com identificadores UUID e 1.339 controles de classe 0 com identificadores GTEx. O repositório não possui manifesto clínico que comprove, amostra por amostra, a procedência dos UUIDs da classe 1."
  155 = "Na base interna, classe e fonte variam juntas: todos os controles são GTEx e todos os registros da classe doente vêm do outro arquivo. Portanto, o Modelo 2 não consegue separar completamente doença de origem, processamento ou lote. As 371 features comuns evitam colunas exclusivas de uma fonte, mas não removem esse confundimento estrutural; por isso, as métricas internas são descritas como associação e triagem."
  156 = "A avaliação externa utilizou a divisão de teste da GSE73002: 1.206 amostras de soro de pessoas com câncer de mama e 1.343 controles sem câncer, medidas na mesma plataforma e contendo 2.540 miRNAs. Não houve coincidência literal entre os IDs GSM externos e os IDs internos, mas, como os sistemas de identificação diferem, isso não prova sozinho independência no nível da pessoa."

  160 = "Foram incluídos no estudo os dados que atenderam aos seguintes critérios:"
  161 = "• miRNAs positivos com evidência bibliográfica, nome maduro resolvido e sequência humana disponível no miRBase;"
  162 = "• sequências maduras compostas pelo alfabeto de RNA e adequadas à extração de k-mers, seed e atributos posicionais;"
  163 = "• registros internos com identificador único, classe binária válida e valores numéricos finitos de expressão;"
  164 = "• features de expressão mapeadas de forma comum entre as duas fontes internas, totalizando 371 colunas;"
  165 = "• candidatos não positivos pontuados apenas por modelos out-of-bag e, no Modelo 2, com expressão disponível;"
  166 = "• amostras externas dos grupos predefinidos TS_B e TS_N, com escala log2 declarada e rastreabilidade por acesso GSM;"
  167 = "• correspondências maduras exatas como desfecho externo primário, mantendo proxies de família em categoria secundária separada."

  171 = "Foram excluídos ou tratados fora do desfecho primário os seguintes dados:"
  172 = "• sequências ausentes, inválidas ou não humanas no universo maduro utilizado;"
  173 = "• os 43 positivos conhecidos do conjunto de candidatos não rotulados, evitando ranqueá-los como novas descobertas;"
  174 = "• candidatos sem expressão na base interna, que permanecem no ranking do Modelo 1, mas não entram no Modelo 2;"
  175 = "• amostras com IDs duplicados, classes inválidas, células vazias ou valores incompatíveis com a escala declarada;"
  176 = "• proxies de família ou precursor do total primário de replicações maduras exatas;"
  177 = "• hairpin precursor, estrutura secundária e energia livre mínima, por decisão explícita de escopo;"
  178 = "• a divisão TR da GSE73002 na análise principal e os grupos não presentes no ZIP recebido; a ausência de 54 amostras oficiais de doença mamária benigna impede avaliar esse diagnóstico diferencial."

  181 = "A coleta computacional reuniu três tipos de insumo: sequências maduras e marcadores positivos para o Modelo 1, expressão interna para o Modelo 2 e uma coorte de soro para avaliação externa. Nenhuma coleta direta foi realizada com participantes. Todos os dados analisados são secundários e os artefatos necessários à reprodução estão organizados no repositório."
  182 = "A base interna foi construída a partir de um CSV de amostras da classe doente e de uma matriz GTEx de controles. Os formatos originais eram diferentes: a matriz saudável apresentava amostras em colunas e identificadores RNAcentral em linhas. O mapeamento RNAcentral/miRBase e a transposição produziram 2.678 amostras e 371 features comuns. A origem da classe 1 é descrita de forma conservadora porque o manifesto clínico correspondente não está versionado."
  183 = "Para o Modelo 1, foi utilizado o arquivo mirbase_mature.fa, com 2.656 sequências humanas maduras únicas, e uma lista curada de 43 positivos distribuídos em 32 famílias de seed. O FASTA de hairpins e os atributos estruturais não integram o pipeline vigente. Os 2.613 miRNAs restantes foram tratados como não rotulados, e não como negativos biológicos confirmados."
  184 = "A coorte externa foi recebida em um ZIP contendo uma matriz de 3.966 amostras por 2.540 miRNAs e um mapa de rastreabilidade. O contraste predefinido selecionou somente TS_B e TS_N, totalizando 2.549 amostras. A matriz preparada preservou os acessos GSM e a escala log2 normalizada por quantis, sem aplicação de um segundo logaritmo."
  185 = "Antes do cálculo externo foram congelados os modelos, o ranking, as direções esperadas, os critérios e os hashes dos artefatos. O protocolo anterior aos resultados foi registrado na tag pre-resultados-gse73002-v1. Essa separação reduz o risco de modificar candidatos ou limiares em resposta ao desempenho observado na coorte."

  188 = "A revisão da base interna verificou dimensões, classes, unicidade dos IDs, valores numéricos, cobertura das 371 features e correspondência do mapeamento. Também foi confirmado que 1.339 controles possuem IDs GTEx e 1.339 registros da classe doente possuem UUIDs de arquivos de quantificação, evidenciando o alinhamento estrutural entre classe e fonte."
  189 = "A lista positiva foi conferida contra o FASTA maduro, e todas as 43 entradas resolvidas estavam presentes. A validação do Modelo 1 foi agrupada por família de seed, de forma que famílias ocultas no fold externo não participassem do treino ou da escolha de hiperparâmetros. Os candidatos não rotulados foram pontuados exclusivamente por modelos nos quais não serviram de contraste temporário."
  190 = "Na coorte externa, o mapa e a matriz foram confrontados integralmente quanto a IDs e classes. A auditoria de proveniência comparou os metadados das 3.966 amostras locais e 144 células numéricas distribuídas com a matriz oficial do GEO; todas as comparações ficaram dentro da tolerância de arredondamento. A fonte oficial contém 4.113 amostras, incluindo 147 não presentes no ZIP recebido."
  191 = "A revisão computacional final contempla 141 verificações automatizadas e 15 testes unitários das rotinas estatísticas. A preparação externa preservou 2/2 artefatos byte a byte e a repetição das análises principal, global e centrada preservou 8/8 saídas. Esses controles demonstram determinismo e integridade computacional, mas não substituem validade biológica ou clínica."

  194 = "O Modelo 1 foi treinado com 43 miRNAs positivos e 2.613 miRNAs não rotulados, todos pertencentes ao universo de 2.656 sequências humanas maduras do miRBase (KOZOMARA; BIRGAOANU; GRIFFITHS-JONES, 2019). Os positivos representam 32 famílias de seed. O pipeline utiliza somente a sequência madura; precursor hairpin, estrutura secundária e energia livre não participam da representação."
  195 = "Foram comparadas oito configurações de atributos maduros. O núcleo incluiu k-mers, região seed, comprimento e fração GC; blocos adicionais avaliaram composição A/U/C/G, entropia, k-mers posicionais e motivos terminais 5p/3p. A configuração final selecionada utilizou k-mers de tamanhos 2, 3 e 4 com informação posicional e regularização L2, resultando em vocabulário de 783 features."
  196 = "Como apenas os positivos são confiáveis, foi adotado aprendizado Positive-Unlabeled (ELKAN; NOTO, 2008). O ensemble final contém 20 bags, cada um com todos os positivos e 800 não rotulados como contraste temporário. Cada candidato recebe a média dos logits somente dos modelos em que não participou do contraste, isto é, entre 6 e 19 modelos out-of-bag; nenhum candidato exigiu fallback."
  197 = "A validação foi aninhada e agrupada por família de seed: cinco folds externos estimaram recuperação em famílias não vistas e três folds internos escolheram a configuração. Essa estratégia reduz vazamento entre sequências aparentadas. Foram ainda comparados baselines de seed, centroide de k-mers, composição madura e ranking aleatório determinístico."
  198 = "A métrica principal do Modelo 1 foi o percentil médio por família, igual a 64,60%, com IC95% bootstrap de 55,85% a 72,85% e p=0,0008 contra rankings aleatórios. O Recall@10% foi 12,50% (4/32; IC95%: 3,13%–25,00%; p=0,2417) e o Recall@20% foi 40,63% (13/32). Portanto, existe sinal global acima do nulo, mas a concentração no primeiro décimo ainda não foi demonstrada estatisticamente."
  199 = "O ranking do Modelo 1 contém 2.613 candidatos; 611 possuíam correspondência na base interna e seguiram para o Modelo 2. Os demais permanecem como resultados sequenciais e não foram descartados biologicamente. A estabilidade de cada candidato foi registrada por mediana, quartis e frequência de presença nas faixas superiores dos 20 bags out-of-bag."
  200 = "O Modelo 2 ajustou, para cada candidato disponível, uma regressão logística univariada com expressão transformada por log1p e predições out-of-fold em cinco folds estratificados. Foram calculados AUC, acurácia, precisão, sensibilidade, especificidade, F1, intervalo aproximado da AUC, diferença de expressão, Cliff's delta, Hedges g e FDR. Como diferentes braços podem compartilhar a mesma feature, 611 candidatos correspondem a 325 hipóteses de expressão únicas."
  201 = "O score de associação interna atribuiu 70% à AUC orientada pela direção, 20% à magnitude de |log2FC| e 10% à presença de detecção. O ranking final combinou 50% do percentil do Modelo 1 com 50% do score do Modelo 2. Também foram calculados pesos alternativos 75/25 e 25/75 e a fronteira de Pareto, permitindo avaliar dependência da ponderação."
  202 = "Os cinco primeiros do ranking integrado foram miR-32-3p (0,9965), let-7f-5p (0,9833), miR-32-5p (0,9734), miR-95-5p (0,9317) e miR-200b-3p (0,9257). As AUCs, precisões e demais métricas quase perfeitas observadas para vários candidatos pertencem à base interna e não representam desempenho diagnóstico generalizável."
  203 = "A limitação central do Modelo 2 é o confundimento estrutural: todos os controles são GTEx e todos os registros da classe doente vieram de outro arquivo. Assim, doença e fonte variam juntas, e validação cruzada não separa sinal biológico de lote, tecido ou processamento (LEEK et al., 2010). Por isso, o Modelo 2 é tratado como triagem interna e recebe menos peso interpretativo que a avaliação externa."
  204 = "O ranking e as direções foram congelados antes da avaliação na GSE73002. A análise principal utilizou 1.206 amostras de câncer de mama e 1.343 controles sem câncer, todas de soro e na mesma plataforma. Entre os 611 candidatos, 579 tiveram correspondência madura exata, 23 foram mapeados apenas por proxy de família e 9 estavam ausentes, totalizando 588 hipóteses externas distintas."
  205 = "Na análise principal, 255 correspondências maduras exatas apresentaram direção concordante, limite inferior aproximado do IC95% da AUC acima de 0,5 e FDR menor que 0,05; 254 também possuíam AUC direcional de pelo menos 0,60. Reproduziram 7/10 do top 10, 13/19 do top 20, 34/47 do top 50 e 60/96 do top 100. A correlação entre score interno e AUC externa foi baixa (rho=0,0852), não sustentando a ordenação completa."
  206 = "Uma auditoria mostrou que a média global dos 2.540 miRNAs por amostra separava as classes com AUC 0,971 e que 95,67% das features apresentavam média maior no câncer. Por isso foi executada, após o resultado, uma sensibilidade que subtrai a média de cada amostra. Ela encontrou 271 replicações maduras exatas; 211 coincidiram com o resultado principal, 203 mantiveram AUC de pelo menos 0,60 nas duas análises e 22 formaram o núcleo maduro estrito sem ambiguidade interna de braço, dos quais 21 mantiveram a magnitude."
  207 = "A matriz oficial possui 4.113 amostras, enquanto o ZIP recebido contém 3.966; não foram incluídas 93 amostras de doença prostática e 54 de doença mamária benigna. O contraste TS_B versus TS_N permanece completo, mas não testa especificidade contra doença mamária benigna. Além disso, cinco dos 43 positivos derivam da publicação ligada à GSE73002. A conclusão defensável é a priorização de 211 sinais convergentes e, de modo conservador, 22 candidatos maduros estritos — não a confirmação de centenas de biomarcadores."

  210 = "A análise ativa está organizada em três etapas: aprendizado de padrões da sequência madura no Modelo 1, associação interna de expressão no Modelo 2 e avaliação externa do ranking congelado. Classificadores históricos de amostras e o integrador bibliográfico anterior permanecem no repositório somente para rastreabilidade e não constituem os resultados principais do TCC."
  211 = "A base interna balanceada contém 2.678 registros e 371 features comuns. A transformação log1p é aplicada dentro das rotinas de associação, e as predições do Modelo 2 são sempre out-of-fold. Embora o balanceamento evite predominância numérica de uma classe, ele não corrige o alinhamento entre classe e fonte, que permanece como limitação obrigatória."
  212 = "No Modelo 1, cada sequência madura é transformada em um vetor de atributos. O ensemble PU aprende diferenças entre os positivos e subconjuntos variados do universo não rotulado, enquanto a pontuação out-of-bag impede que um candidato seja avaliado pelos mesmos modelos em que serviu de contraste. A unidade primária de validação é a família de seed, e não cada marcador isolado."
  213 = "No Modelo 2, cada hipótese de expressão é avaliada separadamente e depois combinada ao percentil sequencial. O score integrado não é probabilidade de câncer: ele é uma prioridade relativa. A coorte externa não altera o score, não escolhe novas direções e não retreina os modelos; apenas mede a transportabilidade dos sinais já congelados."

  216 = "O percentil médio do Modelo 1 indica a posição relativa dos positivos ocultos entre os não rotulados; 64,60% significa que, em média, uma família positiva ficou acima de 64,60% do fundo. Recall@K mede quantas famílias ocultas apareceram dentro da fração superior do ranking. Intervalos bootstrap e rankings aleatórios de Monte Carlo quantificam a incerteza e o desempenho esperado ao acaso."
  217 = "No Modelo 2, acurácia, precisão, sensibilidade, especificidade e F1 são calculadas a partir das predições out-of-fold. A AUC mede ordenação entre classes ao longo dos limiares. Essas métricas são apresentadas por candidato, não como desempenho clínico global do pipeline, porque cada regressão utiliza uma feature e porque a origem das classes está confundida."
  218 = "A inferência interna e externa inclui diferença média, Cliff's delta e Hedges g para magnitude e direção. Os valores-p das hipóteses distintas são corrigidos pelo procedimento Benjamini-Hochberg (BENJAMINI; HOCHBERG, 1995). Na coorte externa, o IC95% aproximado da AUC segue Hanley e McNeil (1982), e valores no piso numérico são relatados como p<1e-16."
  219 = "Um sinal externo é marcado como reproduzido somente quando possui ao menos 10 amostras por classe, direção concordante com a hipótese congelada, limite inferior do IC95% da AUC direcional maior que 0,5 e FDR menor que 0,05. AUC direcional de pelo menos 0,60 é um filtro descritivo de magnitude e não um limiar de utilidade clínica. Correspondências maduras exatas são separadas de proxies."
  220 = "A hierarquia final de evidência distingue: 255 replicações maduras exatas no resultado principal, ainda expostas ao deslocamento global; 211 sinais presentes também na sensibilidade centrada; e 22 candidatos maduros estritos, sem ambiguidade interna de braço nas duas análises. Essa última faixa é a referência conservadora para a defesa, sempre acompanhada das limitações de coorte."

  223 = "O projeto foi implementado em Node.js e PowerShell, com rotinas determinísticas e sem dependências externas de npm para o núcleo analítico. Os scripts geram modelos JSON, rankings CSV, relatórios textuais, resumos JSON e um dashboard HTML. A auditoria automatizada verifica arquivos, dimensões, classes, hashes, métricas, documentação e portabilidade."
  224 = "O script train_mirna_candidate_discovery_model.js treina o Modelo 1 a partir de mirbase_mature.fa, breast_cancer_mirna_positive_markers.csv e breast_cancer_mirna_training_policy.csv. As principais saídas são modelo_mirna_candidate_discovery.json e mirna_candidate_discovery_model_ranking.csv. O artefato registra configuração, folds, baselines, intervalos, testes nulos e estabilidade out-of-bag."
  225 = "O script validate_mirna_candidates_in_patients_model.js implementa o Modelo 2 e produz modelo_mirna_patient_candidate_validation.json, mirna_patient_candidate_validation.csv e mirna_patient_candidate_integrated_ranking.csv. O ranking integrado inclui pesos 50/50, sensibilidades 75/25 e 25/75, fronteira de Pareto, métricas out-of-fold, efeitos e FDR por hipótese única."
  226 = "A coorte externa é preparada por prepare_gse73002_external_cohort.ps1 e avaliada por validate_mirna_external_cohort.js. audit_gse73002_global_shift.js identifica componentes globais, enquanto audit_gse73002_official_provenance.ps1 compara o ZIP com a matriz oficial. Os resultados principal e centrado são mantidos separadamente, sendo o segundo rotulado como pós-hoc."
  227 = "generate_gse73002_cohort_deliverables.js consolida métricas e explicações, generate_mirna_rankings_html.js produz o dashboard e audit_mirna_discovery_pipeline.js executa 141 invariantes. O estado ativo depende somente de sequências maduras; arquivos e algoritmos relacionados a hairpin foram removidos do fluxo vigente e permanecem recuperáveis apenas no histórico do Git."

  228 = "CONSIDERAÇÕES FINAIS E CONTRIBUIÇÕES"
  229 = "O produto obtido é um pipeline acadêmico de descoberta e priorização de hipóteses sobre miRNAs maduros associados ao câncer de mama. Ele recebe sequências de referência e dados de expressão, produz rankings auditáveis e testa o ranking congelado em uma coorte externa. Não retorna diagnóstico individual, não substitui exames e não está calibrado para decisão clínica."
  230 = "As principais contribuições são: adoção de aprendizado Positive-Unlabeled em lugar de negativos presumidos; validação agrupada por família de seed; pontuação out-of-bag; integração transparente entre sequência e expressão; separação entre associação interna e avaliação externa; auditoria de deslocamento global; e definição de um núcleo conservador de 22 candidatos maduros."
  231 = "Para pesquisadores e estudantes, os artefatos permitem inspecionar cada etapa, reproduzir resultados, comparar pesos e acessar métricas por candidato. O dashboard e os relatórios facilitam a defesa dos resultados sem ocultar falhas de reprodução ou proxies. O valor imediato é metodológico e científico: organizar evidência e reduzir o conjunto de hipóteses para estudos posteriores."
  232 = "Do ponto de vista social, estudos de miRNAs circulantes podem contribuir futuramente para estratégias menos invasivas, mas o presente TCC não demonstra benefício assistencial. Essa possibilidade depende de coleta prospectiva, comparação com métodos padrão, controle de fatores clínicos e técnicos, validação laboratorial e avaliação regulatória. A comunicação responsável evita transformar evidência exploratória em promessa diagnóstica."
  233 = "Como trabalhos futuros, recomenda-se testar o núcleo de 22 candidatos em uma segunda coorte totalmente independente, idealmente com controles saudáveis e doença mamária benigna, além de metadados de idade, subtipo, estágio, tratamento e lote. Também são necessários ensaios laboratoriais direcionados, análise de poder, modelos multivariados pré-registrados, correção explícita de lote e validação prospectiva. A GSE73002 não deve ser reutilizada para ajustar a mesma versão e depois ser apresentada novamente como validação independente."

  262 = "BENJAMINI, Y.; HOCHBERG, Y. Controlling the false discovery rate: a practical and powerful approach to multiple testing. Journal of the Royal Statistical Society: Series B, v. 57, n. 1, p. 289–300, 1995."
  263 = "ELKAN, C.; NOTO, K. Learning classifiers from only positive and unlabeled data. In: ACM SIGKDD INTERNATIONAL CONFERENCE ON KNOWLEDGE DISCOVERY AND DATA MINING, 14., 2008. Proceedings [...]. New York: ACM, 2008. p. 213–220. DOI: 10.1145/1401890.1401920."
  264 = "HANLEY, J. A.; MCNEIL, B. J. The meaning and use of the area under a receiver operating characteristic (ROC) curve. Radiology, v. 143, n. 1, p. 29–36, 1982. DOI: 10.1148/radiology.143.1.7063747."
  265 = "KOZOMARA, A.; BIRGAOANU, M.; GRIFFITHS-JONES, S. miRBase: from microRNA sequences to function. Nucleic Acids Research, v. 47, n. D1, p. D155–D162, 2019. DOI: 10.1093/nar/gky1141."
  266 = "LEEK, J. T. et al. Tackling the widespread and critical impact of batch effects in high-throughput data. Nature Reviews Genetics, v. 11, p. 733–739, 2010. DOI: 10.1038/nrg2825."
  267 = "NATIONAL CENTER FOR BIOTECHNOLOGY INFORMATION (NCBI). Gene Expression Omnibus: GSE73002 — A novel combination of serum microRNAs for detecting breast cancer in the early stage. Disponível em: https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE73002. Acesso em: 12 out. 2026."

  279 = "Figura 1 – Arquitetura do pipeline vigente"
  292 = "Figura 2 – Fluxograma de treinamento e avaliação"
}

function Set-ParagraphText {
  param($Document, [int]$Index, [string]$Text)
  $paragraph = $Document.Paragraphs.Item($Index)
  try {
    $range = $paragraph.Range.Duplicate
    try {
      if ($range.End -gt $range.Start) { $range.End = $range.End - 1 }
      $range.Text = $Text
    }
    finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($range) }
  }
  finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($paragraph) }
}

function Replace-InlinePicture {
  param($Document, [int]$Index, [string]$ImagePath)
  $shape = $Document.InlineShapes.Item($Index)
  $width = $shape.Width
  $height = $shape.Height
  $range = $shape.Range.Duplicate
  try {
    $shape.Delete()
    $newShape = $Document.InlineShapes.AddPicture($ImagePath, $false, $true, $range)
    try {
      $newShape.LockAspectRatio = 0
      $newShape.Width = $width
      $newShape.Height = $height
    }
    finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($newShape) }
  }
  finally {
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($range)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shape)
  }
}

[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outputResolved)) | Out-Null
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($pdfResolved)) | Out-Null
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($reportResolved)) | Out-Null
if (Test-Path -LiteralPath $outputResolved) { [System.IO.File]::Delete($outputResolved) }
if (Test-Path -LiteralPath $pdfResolved) { [System.IO.File]::Delete($pdfResolved) }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$document = $null
try {
  $document = $word.Documents.Open($inputResolved, $false, $true)
  if ($document.Paragraphs.Count -ne 297) { throw "Estrutura inesperada: $($document.Paragraphs.Count) paragrafos; esperado: 297." }
  if ($document.InlineShapes.Count -ne 2) { throw "Estrutura inesperada: $($document.InlineShapes.Count) figuras; esperado: 2." }

  foreach ($entry in $updates.GetEnumerator()) { Set-ParagraphText $document ([int]$entry.Key) ([string]$entry.Value) }

  # Evita títulos órfãos no final da página sem alterar tipografia, recuos ou espaçamentos.
  for ($index = 1; $index -le $document.Paragraphs.Count; $index += 1) {
    $paragraph = $document.Paragraphs.Item($index)
    try {
      $styleName = [string]$paragraph.Range.Style.NameLocal
      if ($styleName -match '(?i)título|titulo|heading') { $paragraph.Format.KeepWithNext = -1 }
    }
    finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($paragraph) }
  }

  $referenceStyle = $document.Paragraphs.Item(262).Style
  for ($index = 263; $index -le 267; $index += 1) { $document.Paragraphs.Item($index).Style = $referenceStyle }
  for ($index = 236; $index -le 267; $index += 1) { $document.Paragraphs.Item($index).Format.KeepTogether = -1 }

  Replace-InlinePicture $document 1 $architectureFigure
  Replace-InlinePicture $document 2 $pipelineFigure

  foreach ($tableOfContents in $document.TablesOfContents) { $tableOfContents.Update() | Out-Null }
  $document.Fields.Update() | Out-Null
  $document.Repaginate()
  $pageCount = $document.ComputeStatistics(2)

  $document.SaveAs2($outputResolved, 16)
  $document.ExportAsFixedFormat($pdfResolved, 17)
  $document.Close($false)
  $document = $null
}
finally {
  if ($null -ne $document) { $document.Close($false) }
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$report = @(
  'Atualizacao da documentacao do TCC',
  '',
  "Entrada preservada: $([System.IO.Path]::GetFileName($inputResolved))",
  "DOCX atualizado: $([System.IO.Path]::GetFileName($outputResolved))",
  "PDF atualizado: $([System.IO.Path]::GetFileName($pdfResolved))",
  "Paragrafos substituidos: $($updates.Count)",
  'Figuras substituidas: 2/2',
  'Estrutura de paragrafos preservada: 297',
  "Paginas apos atualizacao: $pageCount",
  '',
  'Conteudo atualizado:',
  '- titulo, resumo, abstract e palavras-chave;',
  '- introducao, justificativa e objetivos;',
  '- revisao bibliografica e trabalhos relacionados;',
  '- tipo de pesquisa, amostra, inclusao e exclusao;',
  '- coleta, metodologia, resultados e estatistica;',
  '- algoritmos, contribuicoes e trabalhos futuros;',
  '- referencias metodologicas e duas figuras;',
  '- Modelo 1, Modelo 2 e coorte externa GSE73002;',
  '- limitacoes de confundimento, deslocamento global e doenca benigna.',
  '',
  'O arquivo original nao foi modificado.',
  ''
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText($reportResolved, $report, [System.Text.UTF8Encoding]::new($false))
Write-Output $report
