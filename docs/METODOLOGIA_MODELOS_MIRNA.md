# Metodologia vigente: descoberta e validacao de candidatos miRNA

Atualizado em 10/10/2026. Este documento descreve a versao executavel atual do TCC. O precursor hairpin e a estrutura secundaria nao participam mais do pipeline principal.

## Resumo do desenho

O fluxo possui dois modelos com perguntas diferentes:

```text
43 miRNAs positivos curados
  -> Modelo 1: aprende k-mers, seed e composicao da sequencia madura
  -> ranking de 2.613 candidatos maduros humanos do miRBase
  -> 611 candidatos com expressao disponivel
  -> Modelo 2: avalia associacao da expressao com doente vs saudavel
  -> ranking de pacientes e ranking integrado
```

O Modelo 1 nao chama os demais miRNAs de negativos biologicos. Eles formam um conjunto nao rotulado, usado apenas como contraste temporario no aprendizado Positive-Unlabeled (PU). O Modelo 2 e uma validacao computacional interna, nao clinica nem laboratorial.

## Reproducao

Executar a partir da raiz do repositorio:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
node scripts\audit_mirna_discovery_pipeline.js
```

O arquivo `data/external/mirbase_mature.fa` e a unica fonte de sequencia usada pelo Modelo 1. O FASTA de hairpins, o CSV estrutural e o gerador Nussinov/RNAfold foram removidos do estado vigente; continuam recuperaveis pelo historico do Git.

## Modelo 1: priorizacao pela sequencia madura

Script: `scripts/train_mirna_candidate_discovery_model.js`.

Tipo serializado: `bagged_positive_unlabeled_mature_sequence_model`.

Entradas principais:

- `data/external/breast_cancer_mirna_positive_markers.csv`;
- `data/external/breast_cancer_mirna_training_policy.csv`;
- `data/external/mirbase_mature.fa`;
- `data/processed/dataset_mirna_balanceado_colunas_comuns.csv`, usado somente para identificar quais candidatos podem seguir ao Modelo 2.

### Representacao ativa

Cada sequencia madura e transformada em:

- frequencias normalizadas de k-mers;
- seed, definida pelas posicoes 2 a 8 da sequencia madura;
- comprimento normalizado;
- fracao de bases G e C.

Hairpin, estrutura secundaria e energia livre minima (MFE) foram retirados deliberadamente. A decisao reduz complexidade e mantem a pergunta do TCC centrada nos padroes da sequencia madura dos miRNAs.

### Pesos positivos e ensemble PU

Os 43 positivos recebem os pesos da politica de evidencia. Para uma seed repetida nao dominar o treino, o peso de cada marcador e dividido pelo numero de positivos da mesma familia e depois reescalado para preservar o peso total.

O ensemble final possui 8 bags. Cada bag usa todos os positivos e uma amostra deterministica de 800 miRNAs nao rotulados como contraste temporario. Cada candidato e pontuado somente pelos modelos em que nao participou desse contraste, isto e, por predicao out-of-bag. A coluna `probabilidade_pu_consenso_bruta` e uma saida contrastiva interna; nao e probabilidade de cancer. O `score_modelo_sequencial` e o percentil relativo usado no ranking.

### Selecao aninhada

- 5 folds externos escondem familias inteiras de seed;
- 3 folds internos escolhem a configuracao em cada treino externo;
- a grade possui 6 configuracoes e testa k-mers ate k=7, regularizacao e peso do conjunto nao rotulado;
- a avaliacao compara cada familia escondida contra todo o background elegivel;
- candidatos com a mesma seed escondida sao removidos apenas daquela comparacao.

A configuracao final foi `k234_mature_seed_l2_003_u050`: k=2,3,4, regularizacao L2 de 0,03 e razao de peso nao rotulado de 0,50. O vocabulario final possui 304 features.

### Metricas atuais

Resultado externo principal, agregado por 32 familias de seed:

| Metrica | Resultado |
|---|---:|
| Percentil medio | 0,6055 |
| Recall@1% | 0/32 (0,00%) |
| Recall@5% | 1/32 (3,13%) |
| Recall@10% | 3/32 (9,38%) |
| Recall@20% | 9/32 (28,13%) |
| IC95% bootstrap do percentil medio | 0,5187 a 0,6902 |
| IC95% bootstrap do Recall@10% | 0,00% a 21,88% |
| p do nulo para percentil medio | 0,0111 |
| p do nulo para Recall@10% | 0,4723 |

Metricas secundarias por marcador: percentil medio 0,6338 e Recall@10% de 5/43 (11,63%). Os intervalos usam 4.000 reamostragens por familia; o teste nulo usa 10.000 simulacoes.

Comparacao por familia:

| Metodo | Percentil medio | Recall@10% |
|---|---:|---:|
| Ensemble PU de sequencia madura | 0,6055 | 9,38% |
| Similaridade de seed | 0,5308 | 0,00% |
| Centroide k-mer maduro | 0,5119 | 6,25% |
| Similaridade de composicao madura | 0,6354 | 9,38% |
| Ranking aleatorio deterministico | 0,5434 | 9,38% |

Interpretacao: o percentil medio esta acima do nulo de ranking, mas o enriquecimento no top 10% nao e significativo. A composicao madura simples obteve percentil observado maior que o ensemble; por isso nao se afirma superioridade geral do modelo complexo.

Em relacao a versao anterior com hairpin, o percentil medio mudou de 0,6035 para 0,6055 (+0,0020, ou +0,20 ponto percentual) e o Recall@10% permaneceu em 9,38%. Essa comparacao entre execucoes nao e um teste formal de superioridade, mas mostra que a retirada do hairpin nao reduziu a metrica principal observada e favorece a escolha do modelo mais simples.

Top 5 atual do Modelo 1: `mir-1277-5p`, `mir-2054`, `mir-1277-3p`, `mir-590-3p` e `mir-548f-3p`.

## Modelo 2: validacao em pacientes

Script: `scripts/validate_mirna_candidates_in_patients_model.js`.

O Modelo 2 recebe os 611 candidatos com feature compativel no dataset. Para cada candidato, ajusta uma regressao logistica univariada em `log1p(expressao)` e produz predicoes out-of-fold por validacao cruzada estratificada deterministica de 5 folds. Depois, ajusta um modelo em todas as amostras apenas para serializacao.

Metricas OOF: AUC, acuracia, precisao, sensibilidade, especificidade e F1. Tambem sao registrados log2 fold-change e proporcao de amostras com expressao maior que zero.

```text
score_validacao_pacientes =
  0,70 * AUC_signal
+ 0,20 * |log2FC|_signal
+ 0,10 * detection_presence_signal

score_final_descoberta =
  0,50 * score_modelo_sequencial
+ 0,50 * score_validacao_pacientes
```

Execucao atual: 611 validados entre 2.613 candidatos; 2.002 nao possuem expressao compativel. Top 5 integrado: `mir-32-3p`, `let-7f-5p`, `mir-32-5p`, `mir-95-5p` e `mir-200b-3p`.

O dataset frequentemente representa precursor ou familia, enquanto o Modelo 1 ranqueia bracos maduros. Assim, 5p e 3p podem compartilhar a mesma feature e as mesmas metricas no Modelo 2. Classe e origem/lote tambem podem estar confundidas; a validacao OOF nao corrige isso.

## Artefatos principais

- `models/modelo_mirna_candidate_discovery.json`: Modelo 1, configuracoes, folds, baselines e incerteza;
- `data/processed/mirna_candidate_discovery_model_ranking.csv`: ranking global do Modelo 1;
- `models/modelo_mirna_patient_candidate_validation.json`: modelos e metricas do Modelo 2;
- `data/processed/mirna_patient_candidate_validation.csv`: ranking puro do Modelo 2;
- `data/processed/mirna_patient_candidate_integrated_ranking.csv`: ranking integrado;
- `reports/mirna_rankings_dashboard.html`: visualizacao;
- `reports/auditoria_pipeline_descoberta_mirna.txt`: auditoria automatizada.

## Limitacoes a declarar

1. Ha somente 43 positivos e 32 familias de seed.
2. O conjunto nao rotulado pode conter miRNAs relevantes; ele nao e uma classe negativa.
3. O Recall@10% nao superou o nulo com significancia nesta execucao.
4. O Modelo 2 reutiliza uma unica base e pode refletir origem ou lote.
5. O dataset de expressao nem sempre distingue os bracos maduros 5p e 3p.
6. Os scores priorizam hipoteses; nao sao probabilidades clinicas nem confirmacao de biomarcadores.
