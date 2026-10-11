# Metodologia vigente: descoberta e validacao de candidatos miRNA

Atualizado em 11/10/2026. O pipeline ativo trabalha exclusivamente com sequencias maduras; precursor hairpin, estrutura secundaria e MFE nao participam dos modelos.

## Desenho

```text
43 miRNAs positivos curados
  -> Modelo 1: aprende padroes da sequencia madura
  -> ranking de 2.613 candidatos humanos
  -> 611 candidatos com expressao disponivel
  -> Modelo 2: avalia associacao com doente vs saudavel
  -> ranking integrado e analise de sensibilidade
  -> coorte externa GSE73002 TS, sem retreinamento
```

O Modelo 1 usa aprendizado Positive-Unlabeled (PU): os demais miRNAs sao nao rotulados e servem somente como contraste temporario. O Modelo 2 e uma avaliacao interna da expressao. Nenhum score e probabilidade clinica ou confirmacao de biomarcador.

## Reproducao

```powershell
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
node scripts\audit_mirna_discovery_pipeline.js
```

Para aplicar o pipeline congelado a uma nova coorte independente:

```powershell
node scripts\validate_mirna_external_cohort.js caminho\coorte_externa.csv --scale linear|log2
```

O formato esperado esta em `docs/FORMATO_COORTE_EXTERNA.md`.

A auditoria automatizada atual cobre 113 invariantes do projeto e esta aprovada sem falhas. Em revisao de reprodutibilidade, os sete artefatos ativos dos Modelos 1 e 2 foram reconstruidos de forma byte a byte identica; seis artefatos cientificos historicos tambem permaneceram identicos ao serem regenerados. Isso demonstra determinismo computacional, nao validade clinica.

## Modelo 1: sequencia madura

Script: `scripts/train_mirna_candidate_discovery_model.js`.

Tipo: `bagged_positive_unlabeled_mature_sequence_model`.

Entradas:

- `data/external/breast_cancer_mirna_positive_markers.csv`;
- `data/external/breast_cancer_mirna_training_policy.csv`;
- `data/external/mirbase_mature.fa`;
- dataset de expressao, somente para marcar disponibilidade no Modelo 2.

### Features avaliadas

Todos os blocos pertencem a sequencia madura:

- k-mers globais;
- seed nas posicoes 2 a 8;
- comprimento e fracao GC;
- proporcoes A, U, C e G e entropia;
- k-mers posicionais, separados nas regioes 5p, central e 3p;
- motivos das extremidades 5p e 3p.

A grade aninhada possui oito configuracoes. Ela compara representacoes, k ate 7, regularizacao L2 e duas configuracoes Elastic Net. A configuracao escolhida foi `k234_positional_mature_l2_003_u050`, com k=2,3,4 e features posicionais. O vocabulario final possui 783 features.

### Ensemble PU e estabilidade

Os pesos de evidencia dos 43 positivos sao balanceados por familia de seed. O modelo final usa 20 bags com 800 nao rotulados por bag. Cada candidato e pontuado somente nos bags em que nao entrou como contraste. Nesta execucao, cada candidato recebeu entre 6 e 19 predicoes out-of-bag e nenhum precisou de fallback.

O ranking registra, por candidato:

- percentil mediano entre bags OOB;
- quartis e IQR do percentil;
- frequencia nos top 1%, 5%, 10% e 20%.

Esses campos medem estabilidade frente a variacao dos contrastes PU. Nao representam incerteza biologica completa.

### Validacao aninhada

- cinco folds externos escondem familias inteiras de seed;
- tres folds internos escolhem a configuracao;
- o background externo usa todos os candidatos elegiveis;
- candidatos com a mesma seed escondida sao removidos apenas daquela comparacao;
- 4.000 reamostragens estimam ICs por familia;
- 10.000 rankings aleatorios formam o teste nulo.

Resultado principal por 32 familias:

| Metrica | Resultado |
|---|---:|
| Percentil medio | 0,6460 |
| Recall@1% | 0/32 (0,00%) |
| Recall@5% | 1/32 (3,13%) |
| Recall@10% | 4/32 (12,50%) |
| Recall@20% | 13/32 (40,63%) |
| IC95% do percentil medio | 0,5585 a 0,7285 |
| IC95% do Recall@10% | 3,13% a 25,00% |
| p do nulo para percentil medio | 0,0008 |
| p do nulo para Recall@10% | 0,2417 |

Por marcador, o percentil medio foi 0,6649 e o Recall@10% foi 8/43 (18,60%). O sinal global melhorou, mas o enriquecimento no top 10% ainda nao e significativo.

### Ablacao pareada de features maduras

A ablação usa os mesmos folds, bags, k, L2, peso nao rotulado e background; apenas o bloco de features muda.

| Representacao | Percentil medio | Recall@10% |
|---|---:|---:|
| Core | 0,6063 | 9,38% |
| Composicao ampliada | 0,5579 | 6,25% |
| K-mers posicionais | 0,6100 | 6,25% |
| Motivos terminais 5p/3p | 0,6829 | 28,13% |
| Todos os blocos | 0,6408 | 18,75% |

Comparado ao core, o bloco terminal apresentou delta pareado de +0,0766, IC95% de 0,0123 a 0,1496, p nominal de permutacao por troca de sinal igual a 0,0369 e FDR Benjamini-Hochberg de 0,0738 depois de corrigir as quatro comparacoes contra o core. A composicao ampliada piorou o resultado. Esse achado e promissor e exploratorio, mas nao permanece significativo a 5% apos a correcao; o modelo final nao foi escolhido olhando a ablação externa.

Top 5 do Modelo 1: `mir-2054`, `mir-1277-5p`, `mir-1277-3p`, `mir-8084` e `mir-374a-3p`.

## Modelo 2: associacao nos pacientes

Script: `scripts/validate_mirna_candidates_in_patients_model.js`.

Para cada um dos 611 candidatos com expressao, o modelo ajusta regressao logistica univariada em `log1p(expressao)` e produz predicoes out-of-fold por validacao cruzada estratificada deterministica de cinco folds.

Metricas: AUC, acuracia, precisao, sensibilidade, especificidade, F1, log2 fold-change e deteccao. Foram acrescentados:

- IC95% aproximado da AUC por Hanley-McNeil, com estabilizacao de meio par concordante quando a AUC fica exatamente em 0 ou 1;
- p unilateral aproximado para testar AUC maior que 0,5;
- FDR Benjamini-Hochberg entre 325 hipoteses de expressao unicas, sem contar miRNAs 5p/3p que usam as mesmas features como testes independentes;
- AUC da expressao bruta, Cliff's delta e Hedges g;
- diferenca media de log1p com IC95%;
- alerta de ambiguidade quando varios candidatos maduros compartilham a mesma feature.

Os ICs e valores-p usam aproximacoes sobre predicoes OOF correlacionadas e devem ser descritos como inferencia interna. Valores que chegam ao piso numerico devem ser lidos como `p<1e-16`, e nao como uma estimativa com centenas de casas decimais. Nesta execucao, 278/325 hipoteses unicas ficaram com FDR abaixo de 0,05 e correspondem a 531 candidatos; o volume excepcionalmente alto reforca a suspeita de lote/fonte, nao a elimina. Alem disso, 552/611 candidatos compartilham sua feature de expressao com outro candidato, geralmente por a base representar precursor ou familia.

### Integracao

O ranking principal continua:

```text
50% Modelo 1 + 50% Modelo 2
```

Tambem sao reportados cenarios 75/25, 25/75 e a fronteira de Pareto. Quatro candidatos ficaram na fronteira de Pareto. Isso permite avaliar robustez sem depender apenas do peso 50/50.

Top 5 integrado: `mir-32-3p`, `let-7f-5p`, `mir-32-5p`, `mir-95-5p` e `mir-200b-3p`.

O grande limite interno permanece: doentes e saudaveis foram montados a partir de fontes de entrada distintas, de modo que classe e origem estao estruturalmente confundidas. Validacao cruzada, FDR ou mais metricas no mesmo conjunto nao conseguem separar doenca de fonte/processamento. Por isso, o Modelo 2 deve ser chamado de associacao interna ou triagem computacional, e nao de validacao biologica independente. A GSE73002 foi usada depois como teste externo, com as limitacoes especificas descritas a seguir.

## Coorte externa

O validador externo:

- exige `sample_id`, `classe` e colunas de expressao;
- rejeita IDs presentes na coorte interna;
- prefere nomes maduros exatos 5p/3p;
- permite proxy de familia, mas o identifica separadamente;
- nao retreina nem seleciona candidatos;
- testa a direcao congelada, AUC externa e IC95%;
- corrige as hipoteses externas distintas por FDR Benjamini-Hochberg;
- classifica o sinal como reproduzido apenas quando existem ao menos 10 amostras por classe, a direcao concorda, o limite inferior do IC95% da AUC direcional supera 0,5 e o FDR fica abaixo de 0,05; esse piso e tecnico e nao substitui calculo de poder;
- contabiliza separadamente a replicacao com miRNA maduro exato e a evidencia obtida por proxy de familia/precursor.

### Protocolo e coorte GSE73002

O modelo e o ranking foram congelados no commit `fab7197` e na tag `pre-validacao-externa-v1`. Antes de calcular os resultados da GSE73002, o protocolo, os hashes, a divisao de amostras e o codigo de compatibilidade log2 foram registrados no commit `e1910ac` e na tag `pre-resultados-gse73002-v1`.

A analise primaria utilizou exclusivamente `TS_B` e `TS_N` do teste original:

- 1.206 amostras de soro de cancer de mama;
- 1.343 controles sem cancer;
- 2.549 amostras no total;
- 2.540 medidas de miRNA;
- escala log2 normalizada por quantis;
- IDs GSM originais na entrada preparada;
- nenhum paciente sobreposto por `sample_id` com TCGA/GTEx.

Os valores log2 foram usados diretamente. Valores negativos foram preservados porque representam a escala transformada, nao expressao biologica negativa. Para cada hipotese foram calculados AUC direcional, IC95%, p unilateral, FDR, Cliff's delta, Hedges g e diferenca media na escala log2.

Resultado primario:

- 579/611 candidatos com correspondencia madura exata, 23 por proxy e 9 ausentes;
- 588 hipoteses externas distintas;
- 255 replicacoes maduras exatas pelo criterio predefinido;
- 254 replicacoes maduras exatas com AUC direcional de pelo menos 0,60;
- 27 replicacoes exatas sem ambiguidade de braco herdada da base interna;
- 7/10, 13/19, 34/47 e 60/96 reproduzidos nos top 10, 20, 50 e 100 avaliaveis;
- Spearman descritivo entre score integrado e AUC externa igual a 0,0852.

### Controle de deslocamento global e sensibilidade

A media global dos 2.540 miRNAs por amostra apresentou AUC 0,971 para separar as classes. 2.430/2.540 miRNAs (95,67%) tinham media maior no cancer, indicando forte deslocamento global de intensidade/coorte. Uma verificacao pontual confirmou correspondencia numerica com a matriz oficial do GEO, portanto o padrao nao foi introduzido pela transposicao local.

Uma sensibilidade pos-resultado subtraiu de cada valor log2 a media global da propria amostra. Ela nao retreinou modelos e nao substitui o desfecho principal. Nessa analise:

- 271 miRNAs maduros exatos atenderam ao criterio estatistico;
- 211 coincidiram com o resultado primario;
- 203 mantiveram AUC de pelo menos 0,60 nas duas analises;
- 22 reproduziram nas duas analises sem ambiguidade interna de braco;
- 21 desses 22 mantiveram AUC de pelo menos 0,60 nas duas analises;
- 13 dos 19 candidatos avaliaveis do top 20 foram robustos nas duas escalas;
- o Spearman score interno vs AUC centrada foi -0,0055.

Assim, a coorte apoia um conjunto amplo de sinais concordantes e um nucleo maduro estrito de 22 candidatos, mas nao valida a calibracao do ranking completo nem autoriza interpretar centenas de sinais como biomarcadores independentes. Cinco marcadores positivos usados no Modelo 1 vieram da publicacao associada a GSE73002; essa dependencia bibliografica indireta tambem limita a independencia total.

## Limitacoes obrigatorias

1. Ha 43 positivos e 32 familias de seed.
2. Nao rotulado nao significa negativo biologico.
3. O Recall@10% externo ainda nao e significativo.
4. A ablação terminal e exploratoria e precisa de repeticao ou mais positivos.
5. A base de expressao atual raramente distingue 5p de 3p.
6. No Modelo 2 interno, classe e fonte de entrada estao estruturalmente confundidas; ele pode capturar origem/processamento em vez de doenca.
7. FDR pequeno na base atual nao elimina confundimento sistematico.
8. A GSE73002 possui deslocamento global de intensidade e dependencia bibliografica parcial; os resultados robustos devem ser definidos pela concordancia entre analise primaria e sensibilidade.
9. Uma segunda coorte independente e validacao laboratorial continuam desejaveis.
