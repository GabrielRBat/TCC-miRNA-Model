# Metodologia vigente: descoberta e validacao de candidatos miRNA

Atualizado em 09/10/2026. Este documento descreve a versao executavel atual do TCC. As secoes antigas do `README.md` e do `context.md` permanecem apenas quando explicitamente identificadas como historico.

## Resumo do desenho

O fluxo possui dois modelos, com perguntas diferentes:

```text
43 miRNAs positivos curados
  -> Modelo 1: aprende padroes de sequencia madura, seed, hairpin e estrutura
  -> ranking de 2.613 candidatos humanos do miRBase
  -> 611 candidatos com feature de expressao no dataset
  -> Modelo 2: avalia associacao da expressao com doente vs saudavel
  -> ranking de pacientes e ranking integrado
```

O Modelo 1 nao usa os demais miRNAs como negativos biologicos. Eles formam um conjunto nao rotulado usado como contraste temporario em um ensemble por bagging. O Modelo 2 nao confirma causalidade nem validade clinica: ele verifica associacao computacional no dataset atual.

## Reproducao

Executar, a partir da raiz do repositorio:

```powershell
node scripts\generate_mirna_secondary_structure_features.js
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
node scripts\audit_mirna_discovery_pipeline.js
```

O primeiro comando e obrigatorio quando o FASTA hairpin muda ou quando o ambiente passa a disponibilizar `RNAfold`. O script de treino tambem gera o CSV estrutural automaticamente se ele estiver ausente.

## Features estruturais do hairpin

Script: `scripts/generate_mirna_secondary_structure_features.js`.

Entrada: `data/external/mirbase_hairpin.fa`.

Saida: `data/processed/mirna_hairpin_structure_features.csv`, atualmente com 1.917 precursores humanos unicos.

O gerador tenta localizar `RNAfold` no ambiente. Se estiver disponivel, usa ViennaRNA/RNAfold e inclui energia livre minima (MFE). Na execucao atual, `RNAfold` nao estava instalado; por isso foi usado `nussinov_weighted_pairing_proxy`, um proxy deterministico de pareamento secundario com pesos GC=3, AU=2 e GU=1 e loop minimo de 3 nucleotideos.

Features atuais:

- fracao GC;
- fracoes pareada e nao pareada;
- densidade, comprimento maximo e comprimento medio de stems;
- densidade de loops e de bulges internos;
- fracoes de pares AU, GC e GU.

O proxy Nussinov nao calcula termodinamica. Portanto, a execucao atual nao inclui nem declara MFE. Para o experimento final congelado do TCC, e recomendavel instalar ViennaRNA, regenerar as features e reexecutar todo o fluxo; se isso nao for possivel, o proxy deve ser relatado exatamente como proxy estrutural.

## Modelo 1: priorizacao Positive-Unlabeled

Script: `scripts/train_mirna_candidate_discovery_model.js`.

Tipo serializado: `bagged_positive_unlabeled_mature_hairpin_structure_model`.

Entradas principais:

- `data/external/breast_cancer_mirna_positive_markers.csv`;
- `data/external/breast_cancer_mirna_training_policy.csv`;
- `data/external/mirbase_mature.fa`;
- `data/external/mirbase_hairpin.fa`;
- `data/processed/mirna_hairpin_structure_features.csv`;
- `data/processed/dataset_mirna_balanceado_colunas_comuns.csv`, usado apenas para marcar disponibilidade para o Modelo 2.

### Representacao

Os k-mers continuam sendo o nucleo do modelo. A representacao combina:

- k-mers normalizados da sequencia madura;
- seed madura;
- comprimento e composicao da sequencia madura;
- k-mers normalizados dos precursores hairpin associados;
- features estruturais dos precursores.

Quando existem varios loci precursores para a mesma familia, seus vetores hairpin/estrutura sao agregados pela media. O unico candidato sem hairpin associado, `mir-517-5p`, e avaliado pelos componentes maduros disponiveis; os pesos restantes nao sao artificialmente renormalizados.

### Pesos positivos e ensemble PU

Os 43 positivos recebem os pesos de evidencia da politica de treinamento. Para evitar que uma seed repetida domine o conjunto, o peso bruto de cada positivo e dividido pelo numero de positivos de sua familia de seed e depois reescalado para preservar a massa total de pesos.

O ensemble final possui 8 bags. Cada bag usa todos os positivos e uma amostra deterministica diferente de 800 miRNAs nao rotulados como contraste temporario. Sao ajustados modelos logisticos regularizados, e pesos e vies do modelo consenso sao obtidos pela media entre bags. Para ranquear o proprio conjunto nao rotulado, cada candidato recebe apenas predicoes out-of-bag, isto e, de modelos em que ele nao foi usado como contraste temporario. Isso evita penalizar artificialmente um candidato por ele ter entrado como exemplo de contraste em alguns bags.

Esta e uma estrategia pratica de priorizacao PU por bagging; nao deve ser descrita como estimativa calibrada da probabilidade de um miRNA causar cancer. A coluna `probabilidade_pu_consenso_bruta` e uma saida contrastiva interna. A coluna `score_modelo_sequencial` e o percentil relativo usado no ranking.

### Selecao aninhada e prevencao de vazamento

A unidade primaria e a familia de seed, nao o marcador individual:

- 5 folds externos avaliam familias nunca vistas no treino nem na selecao de hiperparametros;
- dentro de cada fold externo, 3 folds internos escolhem a configuracao;
- o pool de avaliacao usa todo o background nao rotulado elegivel, em vez de uma amostra de 500;
- candidatos do background com a mesma seed do marcador avaliado sao retirados somente daquela comparacao;
- a grade conjunta possui 6 configuracoes, testa pesos/regularizacao e faixas de k-mers `2-4`, `2-5`, `3-6` e `2-7`;
- a configuracao final e escolhida pela frequencia de selecao externa e pelo desempenho interno, sem escolher pela metrica do fold externo.

A configuracao final desta execucao foi `k234_mature70_hairpin20_structure10`: k=2,3,4 e pesos 70% madura/seed, 20% hairpin e 10% estrutura.

### Metricas e incerteza

Resultado externo principal, agregado por 32 familias de seed:

| Metrica | Resultado |
|---|---:|
| Percentil medio | 0,6035 |
| Recall@1% | 0/32 (0,00%) |
| Recall@5% | 0/32 (0,00%) |
| Recall@10% | 3/32 (9,38%) |
| Recall@20% | 10/32 (31,25%) |
| IC95% bootstrap do percentil medio | 0,5179 a 0,6880 |
| IC95% bootstrap do Recall@10% | 0,00% a 21,88% |
| p do nulo de ranking para percentil medio | 0,0120 |
| p do nulo de ranking para Recall@10% | 0,4723 |

Metricas secundarias por marcador: percentil medio 0,6319 e Recall@10% 5/43 (11,63%). Os intervalos usam 4.000 reamostragens por familia. O teste nulo usa 10.000 simulacoes deterministicas e preserva o numero de marcadores de cada familia.

Comparacao por familia:

| Metodo | Percentil medio | Recall@10% |
|---|---:|---:|
| Ensemble PU com estrutura | 0,6035 | 9,38% |
| Similaridade de seed | 0,5308 | 0,00% |
| Centroide k-mer maduro | 0,5090 | 6,25% |
| Centroide k-mer hairpin | 0,6686 | 9,38% |
| Ranking aleatorio deterministico | 0,5434 | 9,38% |

Interpretacao honesta: o percentil medio do ensemble apresenta sinal acima do nulo de ranking, mas o enriquecimento no top 10% nao e significativo. O centroide simples de hairpin obteve percentil medio maior e o mesmo Recall@10% que o ensemble. Isso indica que o sinal de hairpin merece investigacao e que, com apenas 32 familias, nao ha suporte para afirmar superioridade geral do modelo combinado.

Top 5 atual do Modelo 1: `mir-1277-5p`, `mir-2054`, `mir-1277-3p`, `mir-590-3p` e `mir-548aj-3p`.

## Modelo 2: validacao em pacientes

Script: `scripts/validate_mirna_candidates_in_patients_model.js`.

O Modelo 2 recebe os 611 candidatos que possuem feature compativel no dataset. Para cada candidato, ajusta regressao logistica univariada em `log1p(expressao)` e produz predicoes out-of-fold por validacao cruzada estratificada deterministica de 5 folds. Depois, ajusta um modelo em todas as amostras apenas para serializacao.

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

Execucao atual: 611 validados, de 2.613 candidatos; 2.002 nao possuem expressao compativel no dataset. Top 5 integrado: `mir-32-3p`, `let-7f-5p`, `mir-32-5p`, `mir-95-5p` e `mir-26a-2-3p`.

O dataset frequentemente representa precursor/familia, enquanto o Modelo 1 ranqueia bracos maduros. Assim, 5p e 3p podem compartilhar a mesma feature e as mesmas metricas no Modelo 2. Alem disso, classe e origem/lote podem estar confundidas. A validacao OOF nao corrige esse problema; coorte externa comparavel e validacao laboratorial continuam necessarias.

## Artefatos principais

- `models/modelo_mirna_candidate_discovery.json`: configuracao, pesos, folds, baselines, intervalos e teste nulo do Modelo 1;
- `data/processed/mirna_candidate_discovery_model_ranking.csv`: ranking global do Modelo 1;
- `models/modelo_mirna_patient_candidate_validation.json`: modelos e metricas do Modelo 2;
- `data/processed/mirna_patient_candidate_validation.csv`: ranking puro do Modelo 2;
- `data/processed/mirna_patient_candidate_integrated_ranking.csv`: ranking integrado;
- `reports/mirna_rankings_dashboard.html`: visualizacao;
- `reports/auditoria_pipeline_descoberta_mirna.txt`: auditoria reproduzivel.

## Limitacoes a declarar no TCC

1. Ha apenas 43 marcadores positivos e 32 familias de seed.
2. O conjunto nao rotulado pode conter miRNAs biologicamente relevantes; ele nao e uma classe negativa.
3. A execucao atual usa proxy estrutural Nussinov, nao energia termodinamica do RNAfold.
4. A grade de hiperparametros e pequena e conjunta; ela nao estima isoladamente o efeito causal de cada escolha.
5. O Recall@10% nao foi superior ao nulo com significancia nesta execucao.
6. O Modelo 2 reutiliza uma unica base e pode refletir fonte/lote.
7. Os scores sao prioridades de pesquisa, nao probabilidades clinicas, diagnosticos ou biomarcadores confirmados.
