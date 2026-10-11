# Projeto miRNA - Descoberta e Validacao Computacional de Candidatos

Este projeto organiza dados de sequencia e expressao de miRNAs. O fluxo principal atual prioriza candidatos ao cancer de mama em dois modelos; os classificadores binarios e experimentos estruturais anteriores permanecem como historico:

- `classe = 0`: paciente saudável
- `classe = 1`: paciente doente

## Regra de Manutenção

Sempre que uma mudança alterar o contexto do projeto, atualize também:

```text
README.md
context.md
```

Isso vale para novos scripts, datasets, modelos, métricas, comandos, fluxos de predição, limitações ou mudanças na recomendação de uso.

O projeto comecou transformando uma matriz TXT de saudaveis para a estrutura do CSV de doentes, balanceando as classes em `1339 x 1339` e treinando classificadores de pacientes. O objetivo principal atual e descobrir e priorizar novos miRNAs candidatos ao cancer de mama: o Modelo 1 usa ensemble PU com k-mers, seed e composicao da sequencia madura; o Modelo 2 usa validacao cruzada de expressao nos pacientes. Hairpin e estrutura secundaria nao participam do fluxo vigente. Consulte [`docs/METODOLOGIA_MODELOS_MIRNA.md`](docs/METODOLOGIA_MODELOS_MIRNA.md).

## Estrutura do Projeto

```text
miRNA/
├── data/
│   ├── raw/
│   │   ├── dataset_mirna_raw (doentes).csv
│   │   └── miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).txt
│   ├── external/
│   │   ├── rnacentral_mirbase_mapping.tsv
│   │   ├── mirbase_mature.fa
│   │   ├── breast_cancer_mirna_positive_markers.csv
│   │   └── breast_cancer_mirna_training_policy.csv
│   └── processed/
│       ├── dataset_mirna_balanceado.csv
│       ├── dataset_mirna_balanceado_colunas_comuns.csv
│       ├── dataset_mirna_painel_12_disponiveis.csv
│       ├── mirna_candidate_discovery_model_ranking.csv
│       ├── mirna_patient_candidate_validation.csv
│       └── mirna_patient_candidate_integrated_ranking.csv
├── models/
│   ├── modelo_mirna_logistic.json
│   ├── modelo_mirna_painel.json
│   ├── modelo_mirna_candidate_discovery.json
│   └── modelo_mirna_patient_candidate_validation.json
├── predictions/
│   ├── predicoes_teste_dataset.csv
│   └── predicoes_teste_painel.csv
├── reports/
│   ├── dataset_mirna_balanceado_report.txt
│   ├── modelo_mirna_metricas.txt
│   ├── modelo_mirna_painel_metricas.txt
│   ├── modelo_mirna_candidate_discovery_report.txt
│   ├── modelo_mirna_patient_candidate_validation_report.txt
│   ├── auditoria_pipeline_descoberta_mirna.txt
│   └── mirna_rankings_dashboard.html
├── docs/
│   ├── METODOLOGIA_MODELOS_MIRNA.md
│   ├── FORMATO_COORTE_EXTERNA.md
│   ├── GUIA_DIDATICO_PIPELINE_MIRNA.html
│   └── GUIA_DIDATICO_PIPELINE_MIRNA.pdf
├── scripts/
│   ├── build_balanced_mirna_dataset.js
│   ├── train_mirna_logistic_model.js
│   ├── train_mirna_panel_model.js
│   ├── predict_mirna_with_model.js
│   ├── predict_mirna_panel_model.js
│   ├── generate_mirna_didactic_guide.js
│   ├── train_mirna_candidate_discovery_model.js
│   ├── validate_mirna_candidates_in_patients_model.js
│   ├── validate_mirna_external_cohort.js
│   ├── generate_mirna_rankings_html.js
│   └── audit_mirna_discovery_pipeline.js
├── README.md
└── context.md
```

## Estado de Versionamento

O projeto foi publicado no GitHub:

```text
https://github.com/GabrielRBat/TCC-miRNA-Model.git
```

Branch local atual:

```text
master
```

Upstream configurado:

```text
origin/master
```

Comandos normais a partir de agora:

```powershell
git pull
git push
```

Observação: o raw saudável completo de 144 MB não foi enviado ao GitHub. O arquivo versionado é um subset de aproximadamente 13 MB com 1500 amostras saudáveis não usadas no dataset balanceado inicial.

## Dados Originais

### `data/raw/dataset_mirna_raw (doentes).csv`

CSV original com pacientes doentes.

Formato:

```text
sample_id,classe,hsa-let-7a-1,hsa-let-7a-2,...
```

Resumo:

- 1339 registros
- classe original: `1`
- cada linha representa uma amostra
- cada coluna depois de `classe` representa um miRNA

### `data/raw/miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).txt`

TXT com pacientes saudáveis em formato de matriz.

Observação importante: para permitir publicação no GitHub, o arquivo versionado nesta pasta não é mais o raw completo de 144 MB. Ele foi substituído por um subset com 1500 amostras saudáveis que não foram usadas no dataset balanceado inicial.

Formato original:

```text
        GTEX-...    GTEX-...    GTEX-...
URS...  valor       valor       valor
URS...  valor       valor       valor
```

Esse arquivo estava transposto em relação ao CSV:

- no TXT, as amostras saudáveis estavam nas colunas
- os miRNAs estavam nas linhas
- os miRNAs estavam identificados por IDs `URS...`, não por nomes `hsa-mir-*`

Subset atual versionado:

```text
amostras saudáveis: 1500
colunas totais: 1501
amostras puladas por já terem sido usadas no dataset balanceado: 1339
índices selecionados no TXT completo original: 1340..2839
tamanho aproximado: 13 MB
```

O raw completo foi preservado apenas localmente e ignorado pelo Git:

```text
data/raw/_local_full_raw/miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).full.txt
```

Essa pasta está no `.gitignore`.

## Mapeamento de IDs

### `data/external/rnacentral_mirbase_mapping.tsv`

Arquivo de mapeamento RNAcentral/miRBase usado para relacionar IDs `URS...` com nomes de miRNA.

Fonte:

```text
https://ftp.ebi.ac.uk/pub/databases/RNAcentral/current_release/id_mapping/database_mappings/
```

Esse arquivo foi necessário porque o TXT saudável usa IDs RNAcentral (`URS...`), enquanto o CSV de doentes usa nomes como `hsa-mir-106a`.

## Datasets Processados

### `data/processed/dataset_mirna_balanceado.csv`

Dataset balanceado principal com a estrutura completa do CSV original.

Resumo:

```text
linhas de dados: 2678
classe 0: 1339 saudáveis
classe 1: 1339 doentes
colunas: 1883
```

Observação importante: esse arquivo mantém todas as colunas do CSV original de doentes. Para os miRNAs que não tiveram correspondência válida no TXT saudável, os valores saudáveis ficaram como `0`.

### `data/processed/dataset_mirna_balanceado_colunas_comuns.csv`

Dataset balanceado recomendado para modelagem.

Resumo:

```text
linhas de dados: 2678
classe 0: 1339 saudáveis
classe 1: 1339 doentes
colunas: 373
miRNAs: 371
```

Esse arquivo mantém apenas os miRNAs que puderam ser preenchidos de forma válida nos dois grupos. Ele é mais seguro para machine learning porque evita treinar o modelo em colunas artificiais zeradas nos saudáveis.

### `data/processed/dataset_mirna_painel_12_disponiveis.csv`

Dataset focado no painel biológico informado.

Painel informado:

```text
let-7b-5p
miR-106a-5p
miR-19a-3p
miR-19b-3p
miR-20a-5p
miR-223-3p
miR-25-3p
miR-425-5p
miR-451a
miR-92a-3p
miR-93-5p
miR-16-5p
```

Marcadores disponíveis no dataset final:

```text
let-7b-5p
miR-106a-5p
miR-19a-3p
miR-19b-3p
miR-20a-5p
miR-25-3p
miR-92a-3p
miR-93-5p
```

Marcadores ausentes por falta de correspondência válida nos saudáveis:

```text
miR-223-3p
miR-425-5p
miR-451a
miR-16-5p
```

Quando havia múltiplas colunas precursoras para um marcador, foi usada a média:

```text
miR-19b-3p = média de hsa-mir-19b-1 e hsa-mir-19b-2
miR-92a-3p = média de hsa-mir-92a-1 e hsa-mir-92a-2
```

## Scripts

Todos os scripts rodam com Node.js. Eles foram ajustados para serem executados a partir da raiz do projeto.

### Gerar datasets balanceados

```powershell
node scripts\build_balanced_mirna_dataset.js
```

Esse script:

- lê o CSV de doentes
- lê o TXT de saudáveis
- usa o mapeamento RNAcentral/miRBase
- seleciona 1339 amostras saudáveis
- gera o CSV balanceado completo
- gera o CSV filtrado por colunas comuns
- cria o relatório de transformação

Saídas:

```text
data/processed/dataset_mirna_balanceado.csv
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
reports/dataset_mirna_balanceado_report.txt
```

Observação: após a substituição do raw saudável completo pelo subset de 1500 amostras não usadas, esse script passa a usar esse subset como fonte saudável se for reexecutado. Os datasets processados já existentes foram gerados anteriormente a partir do raw completo original.

### Criar subset saudável para versionamento

```powershell
node scripts\create_unused_healthy_raw_subset.js
```

Esse script:

- preserva o raw completo em `data/raw/_local_full_raw/`;
- ignora esse backup no Git;
- substitui o arquivo saudável versionado por um subset menor;
- pula as primeiras 1339 amostras saudáveis já usadas no dataset balanceado;
- seleciona as 1500 amostras seguintes.

### Treinar modelo baseline com 371 miRNAs

```powershell
node scripts\train_mirna_logistic_model.js
```

Esse modelo usa:

- dataset: `dataset_mirna_balanceado_colunas_comuns.csv`
- algoritmo: regressão logística binária
- transformação: `log1p(valor)`
- padronização: média e desvio padrão calculados apenas no treino
- split: treino/teste estratificado 80/20

Saídas:

```text
models/modelo_mirna_logistic.json
reports/modelo_mirna_metricas.txt
```

Métricas observadas no teste:

```text
accuracy = 100.00%
precision = 100.00%
recall = 100.00%
AUC = 1.0000
```

### Treinar modelo com painel biológico

```powershell
node scripts\train_mirna_panel_model.js
```

Esse é o modelo recomendado como principal, porque usa marcadores biologicamente guiados.

Saídas:

```text
data/processed/dataset_mirna_painel_12_disponiveis.csv
models/modelo_mirna_painel.json
reports/modelo_mirna_painel_metricas.txt
```

Métricas observadas no teste:

```text
accuracy = 99.44%
precision = 100.00%
recall = 98.88%
AUC = 1.0000
```

## Predição

### Predizer usando o modelo baseline

```powershell
node scripts\predict_mirna_with_model.js arquivo_novo.csv predictions\predicoes.csv
```

O arquivo de entrada precisa conter as mesmas colunas usadas no treino do baseline.

### Predizer usando o modelo do painel

```powershell
node scripts\predict_mirna_panel_model.js arquivo_novo.csv predictions\predicoes_painel.csv
```

O arquivo de entrada precisa conter as colunas precursoras usadas pelo painel:

```text
hsa-let-7b
hsa-mir-106a
hsa-mir-19a
hsa-mir-19b-1
hsa-mir-19b-2
hsa-mir-20a
hsa-mir-25
hsa-mir-92a-1
hsa-mir-92a-2
hsa-mir-93
```

Saída da predição:

```text
sample_id,probabilidade_doente,classe_predita
```

Interpretação:

```text
probabilidade_doente >= 0.5 -> classe_predita = 1
probabilidade_doente < 0.5  -> classe_predita = 0
```

## Modelos

### `models/modelo_mirna_logistic.json`

Modelo baseline treinado com 371 miRNAs.

Contém:

- lista de features
- médias do treino
- desvios padrão do treino
- pesos da regressão logística
- bias
- threshold de classificação

### `models/modelo_mirna_painel.json`

Modelo treinado com os marcadores disponíveis do painel biológico.

Contém:

- marcadores usados
- colunas fonte de cada marcador
- marcadores ausentes
- médias e desvios padrão
- pesos aprendidos
- bias
- threshold

## Relatórios

### `reports/dataset_mirna_balanceado_report.txt`

Documenta a transformação dos dados:

- quantas linhas foram copiadas
- quantas amostras saudáveis foram adicionadas
- quantos miRNAs foram mapeados
- quais colunas ficaram ausentes
- exemplos de mapeamento entre miRNAs maduros e colunas precursoras

### `reports/modelo_mirna_metricas.txt`

Métricas do modelo baseline com 371 miRNAs.

Inclui:

- accuracy
- precision
- recall/sensibilidade
- specificity
- F1
- AUC
- matriz de confusão
- principais miRNAs por peso positivo e negativo

### `reports/modelo_mirna_painel_metricas.txt`

Métricas do modelo focado no painel.

Inclui:

- marcadores usados
- marcadores ausentes
- métricas de treino e teste
- pesos aprendidos por marcador

## Decisões Técnicas

### Por que usar `dataset_mirna_balanceado_colunas_comuns.csv`?

Porque ele evita ensinar o modelo com colunas que existem nos doentes, mas não existem de forma confiável nos saudáveis. Isso reduz o risco de o modelo aprender um artefato de preenchimento.

### Por que usar regressão logística?

Porque este é um problema tabular, com poucas milhares de amostras. Para esse cenário, modelos clássicos costumam ser mais interpretáveis e estáveis do que redes neurais.

Benefícios:

- simples de treinar
- rápido
- interpretável
- gera pesos por miRNA
- bom baseline antes de modelos mais complexos

### Por que o painel biológico é importante?

O painel informado concentra miRNAs já associados à doença. Isso reduz ruído, melhora interpretabilidade e aproxima o modelo da hipótese biológica.

## Limitações Importantes

As métricas ficaram extremamente altas. Isso precisa ser interpretado com cuidado.

Possíveis causas:

- o modelo pode estar aprendendo sinal real da doença
- o modelo pode estar aprendendo diferenças de fonte/lote entre os dados de doentes e saudáveis
- o TXT saudável e o CSV de doentes podem ter sido processados por pipelines diferentes
- parte do painel original não está disponível nos saudáveis

Antes de usar como evidência diagnóstica real, o ideal é validar com:

- coorte externa independente
- dados saudáveis e doentes processados pelo mesmo pipeline
- correção de efeito de lote
- validação cruzada por origem/coorte
- avaliação clínica supervisionada por especialista

## Próximos Passos Recomendados

1. Obter dados saudáveis que contenham os 12 miRNAs completos do painel.
2. Recriar o dataset do painel com os 12 marcadores.
3. Fazer validação externa real.
4. Testar modelos adicionais, como Random Forest, XGBoost ou SVM.
5. Aplicar correção de lote se houver metadados suficientes.
6. Criar uma interface simples para carregar uma amostra e retornar a probabilidade de doença.

## Comandos Úteis

Regenerar os datasets:

```powershell
node scripts\build_balanced_mirna_dataset.js
```

Treinar baseline:

```powershell
node scripts\train_mirna_logistic_model.js
```

Treinar painel:

```powershell
node scripts\train_mirna_panel_model.js
```

Predizer com painel:

```powershell
node scripts\predict_mirna_panel_model.js data\processed\dataset_mirna_balanceado_colunas_comuns.csv predictions\predicoes_teste_painel.csv
```

## Resumo Final

O projeto agora contém:

- dados brutos preservados
- dados processados balanceados
- dataset recomendado para modelagem
- dataset focado no painel biológico
- scripts reprodutíveis
- modelos treinados
- relatórios de métricas
- scripts de predição
- documentação completa

O modelo mais alinhado com a hipótese biológica é:

```text
models/modelo_mirna_painel.json
```

O dataset mais recomendado para novas análises é:

```text
data/processed/dataset_mirna_painel_12_disponiveis.csv
```

## Historico: Primeira Descoberta de Candidatos por Sequencia

Esta secao preserva a primeira abordagem exploratoria, baseada apenas em similaridade de sequencias maduras. Ela foi substituida como fluxo principal pelos dois modelos documentados na secao "Atualizacao: Dois Modelos para Descoberta de Novos Marcadores". Os scripts e artefatos antigos continuam no repositorio apenas para rastreabilidade.

Esta evolucao adiciona uma camada exploratoria ao projeto. O pipeline antigo continua existindo para treinar modelos de expressao e predizer `classe = 0` ou `classe = 1`. A nova etapa responde outra pergunta:

```text
Quais outros miRNAs humanos presentes na base compartilham padroes sequenciais com os 12 marcadores conhecidos?
```

Essa etapa nao apresenta os candidatos como diagnostico. Ela gera hipoteses computacionais que precisam de validacao biologica/laboratorial.

### Ambiente

O projeto usa Node.js e nao depende de pacotes externos de npm.

```powershell
cd "C:\Users\ACS INFO PC\Downloads\miRNA"
node --version
```

Versao usada no ambiente local:

```text
Node.js v22.13.0
```

### Novos Arquivos

Entrada externa:

```text
data/external/mirbase_mature.fa
```

O `mirbase_mature.fa` contem sequencias maduras de miRNAs do miRBase e e a fonte de sequencia do pipeline atual. O antigo FASTA de hairpins foi removido do estado vigente e continua recuperavel no historico do Git.

O pipeline vigente voltou a usar somente `mirbase_mature.fa`; a secao "Atualizacao: Dois Modelos para Descoberta de Novos Marcadores" descreve a versao atual.

Novo script:

```text
scripts/discover_mirna_sequence_candidates.js
```

Novas saidas:

```text
data/processed/mirna_sequence_candidate_ranking.csv
models/modelo_mirna_sequence_patterns.json
reports/mirna_sequence_candidate_discovery_report.txt
```

### Como Executar o Pipeline Antigo

Regenerar datasets balanceados:

```powershell
node scripts\build_balanced_mirna_dataset.js
```

Treinar baseline com 371 miRNAs:

```powershell
node scripts\train_mirna_logistic_model.js
```

Treinar modelo do painel biologico:

```powershell
node scripts\train_mirna_panel_model.js
```

Predizer com o painel:

```powershell
node scripts\predict_mirna_panel_model.js data\processed\dataset_mirna_balanceado_colunas_comuns.csv predictions\predicoes_teste_painel.csv
```

### Como Executar a Nova Descoberta

```powershell
node scripts\discover_mirna_sequence_candidates.js
```

Entradas esperadas:

```text
data/external/mirbase_mature.fa
data/external/breast_cancer_mirna_positive_markers.csv
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
models/modelo_mirna_logistic.json
```

Entrada complementar usada somente em um experimento historico e removida do estado vigente:

```text
data/external/mirbase_hairpin.fa
```

O modelo baseline de expressao e usado apenas como evidencia auxiliar no CSV final. Ele nao entra no score sequencial.

### Logica Computacional

O script localiza no FASTA as sequencias maduras dos 12 marcadores:

```text
let-7b-5p
miR-106a-5p
miR-19a-3p
miR-19b-3p
miR-20a-5p
miR-223-3p
miR-25-3p
miR-425-5p
miR-451a
miR-92a-3p
miR-93-5p
miR-16-5p
```

Depois transforma cada sequencia em vetores de k-mers. K-mers sao pequenas subsequencias contiguas, como `AUG`, `GCUA` ou `UGCAG`. Foram usados k = 2, 3, 4 e 5.

A vetorizacao e usada porque permite comparar sequencias numericamente sem decorar o nome do miRNA.

O script tambem:

- calcula um centroide, ou perfil medio, dos 12 marcadores;
- encontra motifs/k-mers recorrentes e enriquecidos nos marcadores;
- calcula similaridade de cada candidato com o centroide;
- calcula similaridade com o marcador conhecido mais proximo;
- compara a regiao seed dos candidatos com as seeds dos marcadores;
- gera ranking dos possiveis candidatos.

Formula do score:

```text
0.50 * similaridade com centroide dos marcadores
+ 0.25 * similaridade com marcador mais proximo
+ 0.15 * cobertura de motifs enriquecidos
+ 0.10 * similaridade da regiao seed
```

### Como Interpretar as Saidas

Arquivo principal:

```text
reports/mirna_sequence_candidate_discovery_report.txt
```

Esse relatorio mostra:

- marcadores conhecidos analisados;
- sequencias e seeds encontradas;
- principais motifs/k-mers enriquecidos;
- pares de marcadores com maior similaridade;
- novos candidatos sugeridos;
- score de cada candidato;
- marcadores mais proximos;
- motifs compartilhados.

CSV detalhado:

```text
data/processed/mirna_sequence_candidate_ranking.csv
```

Colunas importantes:

- `score_hipotese`: proximidade sequencial com o perfil dos marcadores.
- `similaridade_centroide`: semelhanca com o perfil medio dos marcadores.
- `similaridade_marcador_mais_proximo`: maior semelhanca com um marcador individual.
- `cobertura_motifs`: proporcao ponderada dos motifs enriquecidos encontrados no candidato.
- `similaridade_seed`: semelhanca da regiao seed.
- `motifs_compartilhados`: padroes do painel encontrados no candidato.
- `features_expressao_associadas`: colunas do dataset de expressao ligadas ao candidato.

Score alto significa maior proximidade sequencial com os marcadores conhecidos. Nao significa probabilidade real de cancer de mama.

### Exemplo de Resultado

Na execucao historica desse script, foram encontradas 43/43 sequencias dos biomarcadores positivos e avaliados 221 candidatos humanos presentes na base. Os primeiros candidatos daquele ranking foram:

```text
1. mir-449a       score=0.6500
2. mir-20b-5p     score=0.6381
3. let-7i-5p      score=0.6316
4. let-7c-5p      score=0.6297
5. mir-526b-3p    score=0.6270
```

Esses nomes devem ser lidos como possiveis candidatos ou hipoteses computacionais.

### Limitacoes

- A abordagem usa similaridade sequencial, nao validacao biologica.
- Muitos candidatos de topo podem ser da mesma familia dos marcadores, porque familias de miRNA compartilham sequencias parecidas.
- O score nao usa coorte externa, alvos biologicos, vias moleculares ou validacao experimental.
- O FASTA traz sequencias maduras; o dataset de expressao usa muitas colunas em nivel de precursor, entao o script faz mapeamento por familia/base do nome.
- O resultado nao e diagnostico definitivo, biomarcador validado ou evidencia clinica.

### Proximos Passos Recomendados

1. Validar os candidatos contra literatura e bancos como miRTarBase, miRDB, TargetScan ou fontes equivalentes.
2. Combinar o score sequencial com expressao diferencial entre saudaveis e doentes.
3. Investigar alvos dos candidatos e enriquecimento de vias relacionadas a cancer de mama.
4. Testar candidatos em coorte independente processada pelo mesmo pipeline.
5. Se houver rotulos confiaveis de miRNAs associados e nao associados, evoluir de score one-class para modelo supervisionado.

### Estado Atual do Universo de miRNAs

O projeto usa uma referencia de sequencia do miRBase em `data/external/`:

```text
mirbase_mature.fa
```

Uso recomendado:

- `mirbase_mature.fa`: universo de miRNAs maduros; usado atualmente pelo script de descoberta sequencial.

O arquivo curado de biomarcadores positivos de cancer de mama e:

```text
data/external/breast_cancer_mirna_positive_markers.csv
```

Esse arquivo contem:

- biomarcadores do painel inicial do projeto;
- lista consolidada de miRNAs encontrados em serum/soro enviada pelo usuario;
- classificacao por recorrencia bibliografica focada em serum/soro.

O script historico `scripts/discover_mirna_sequence_candidates.js` carrega esse CSV automaticamente. No fluxo principal atual, todo novo biomarcador deve ser incluido tanto na lista bibliografica quanto em `breast_cancer_mirna_training_policy.csv` antes de executar os dois modelos.

### Lista consolidada de biomarcadores serum/soro

A lista consolidada usa a classificacao por recorrencia bibliografica informada pelo usuario:

- alta recorrencia: miRNAs encontrados em 3 ou mais fontes serum/soro ou estudos circulantes relevantes;
- media recorrencia: miRNAs encontrados em 2 fontes;
- exploratoria: miRNAs encontrados em 1 fonte.

Essa classificacao nao representa diagnostico definitivo, validacao clinica, maior tamanho amostral ou melhor desempenho clinico. Ela serve apenas para organizar a lista inicial e priorizar a analise computacional.

Alta recorrencia:

```text
miR-125b
miR-10b
miR-145
miR-155
miR-195
miR-21
```

Media recorrencia:

```text
miR-16
miR-210
miR-34a
```

Exploratorios:

```text
let-7a
miR-1
miR-1246
miR-125a
miR-1307-3p
miR-139-5p
miR-17-5p
miR-181b
miR-191
miR-19a
miR-200a
miR-205
miR-206
miR-24
miR-31
miR-365
miR-373
miR-382
miR-4634
miR-497
miR-520c
miR-6861-5p
miR-6875-5p
miR-99a
```

O CSV tambem manteve marcadores do painel inicial do projeto, como `let-7b-5p`, `miR-106a-5p`, `miR-19b-3p`, `miR-20a-5p`, `miR-223-3p`, `miR-25-3p`, `miR-425-5p`, `miR-451a`, `miR-92a-3p` e `miR-93-5p`.

Alguns nomes de literatura nao indicam explicitamente braco `5p` ou `3p`. Nesses casos, o CSV usa `resolved_mature_mirna` para registrar a forma madura usada no miRBase, por exemplo:

```text
miR-10b -> hsa-miR-10b-5p
miR-145 -> hsa-miR-145-5p
miR-155 -> hsa-miR-155-5p
miR-195 -> hsa-miR-195-5p
miR-21  -> hsa-miR-21-5p
miR-210 -> hsa-miR-210-3p
miR-24  -> hsa-miR-24-3p
miR-365 -> hsa-miR-365a-3p
miR-520c -> hsa-miR-520c-3p
```

Essas resolucoes devem ser revisadas se uma fonte posterior especificar outro braco maduro.

### Politica de treinamento dos 43 biomarcadores

A evidencia bibliografica e a decisao de treinamento ficam separadas:

```text
data/external/breast_cancer_mirna_positive_markers.csv
data/external/breast_cancer_mirna_training_policy.csv
```

O primeiro arquivo preserva fontes, tipo de amostra, recorrencia e observacoes biologicas. O segundo registra, para cada forma madura resolvida, o nivel usado pelo modelo, peso numerico, inclusao no treinamento e justificativa curta.

Na configuracao atual, os 43 biomarcadores entram no Modelo 1 com os seguintes pesos:

```text
alta recorrencia = 3
media recorrencia = 2
painel inicial = 2
exploratoria = 1
```

MiR-16-5p e miR-19a-3p recebem peso 2 por tambem pertencerem ao painel inicial. Separar a politica da lista bibliografica permite mudar uma decisao computacional sem apagar ou reescrever a evidencia original.

### Como adicionar novos biomarcadores no fluxo principal atual

Quando novos biomarcadores forem encontrados, editar:

```text
data/external/breast_cancer_mirna_positive_markers.csv
data/external/breast_cancer_mirna_training_policy.csv
```

Todo marcador usado pelo Modelo 1 precisa existir nos dois arquivos. O script principal interrompe a execucao se encontrar um positivo sem politica de treinamento correspondente.

Formato:

```text
mirna,resolved_mature_mirna,direcao,evidencia,fonte,tipo_amostra,numero_fontes,recorrencia_bibliografica,prioridade_projeto,urls,observacao
```

Exemplo:

```text
miR-9-5p,hsa-miR-9-5p,nao_informada,candidato_serum,Autor et al.,soro,1,exploratoria,exploratoria,https://exemplo,Candidato exploratorio; necessita validacao experimental.
```

Depois executar:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
```

O fluxo atual vai:

- validar a correspondencia entre a lista bibliografica e a politica de treinamento;
- localizar sequencias maduras; a localizacao de hairpins pertence somente ao experimento historico;
- retreinar o Modelo 1 e recalcular o ranking global;
- reexecutar a validacao cruzada do Modelo 2;
- atualizar modelos JSON, rankings CSV, relatorios TXT e dashboard HTML.

### Resultado historico do pipeline exploratorio anterior

A execucao validada apos incorporar a lista consolidada ficou:

```text
Biomarcadores positivos solicitados: 43
Biomarcadores positivos com sequencia encontrada: 43
Candidatos humanos avaliados: 221
```

Top 5 candidatos gerados nessa versao:

```text
mir-449a       score=0.6500
mir-20b-5p     score=0.6381
let-7i-5p      score=0.6316
let-7c-5p      score=0.6297
mir-526b-3p    score=0.6270
```

O ranking mudou porque agora o perfil positivo incorpora uma lista mais ampla de candidatos serum/soro, alem dos marcadores do painel inicial.

O perfil positivo e ponderado por prioridade:

```text
alta = 3
media = 2
painel_inicial = 2
exploratoria = 1
```

### Historico: evidencia integrada anterior

Foi adicionada uma etapa para cruzar as hipoteses sequenciais com o dataset de pacientes:

```text
scripts/build_integrated_mirna_candidate_evidence.js
```

Comando:

```powershell
node scripts\build_integrated_mirna_candidate_evidence.js
```

Entradas:

```text
data/processed/mirna_sequence_candidate_ranking.csv
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
models/modelo_mirna_sequence_patterns.json
```

Saidas:

```text
data/processed/mirna_integrated_candidate_evidence.csv
reports/mirna_integrated_candidate_evidence_report.txt
```

Essa etapa calcula, para cada candidato:

- score sequencial;
- medias e medianas em doentes e saudaveis;
- log2 fold-change doente vs saudavel;
- AUC univariada usando a expressao do miRNA;
- percentual de amostras com expressao maior que zero;
- biomarcadores positivos mais proximos por sequencia;
- suporte de recorrencia das referencias mais proximas.

Formula usada:

```text
score_integrado =
  0.45 * score_sequencial
+ 0.45 * score_expressao
+ 0.10 * suporte_recorrencia_referencias
```

O `score_expressao` combina AUC univariada absoluta, magnitude de log2 fold-change e diferenca de presenca maior que zero entre doentes e saudaveis.

Execucao validada:

```text
Candidatos avaliados: 221
```

Top 5 por evidencia integrada:

```text
let-7f-5p      score_integrado=0.7947
mir-106b-5p    score_integrado=0.7927
mir-103a-3p    score_integrado=0.7753
let-7c-5p      score_integrado=0.7749
mir-486-5p     score_integrado=0.7645
```

Importante: esse ranking integrado e diferente do ranking sequencial puro. O ranking sequencial prioriza semelhanca de padroes. O ranking integrado sobe candidatos que tambem mostram forte separacao entre `classe=1` doente e `classe=0` saudavel no dataset atual.

Essa separacao pode refletir sinal biologico, mas tambem pode refletir efeito de lote/fonte. Portanto, os resultados continuam sendo candidatos, marcadores suspeitos e hipoteses computacionais que precisam de validacao experimental/laboratorial.

Quando essa lista existir, o ranking mais robusto devera combinar:

```text
expressao estavel nos pacientes
similaridade com marcadores conhecidos
motifs/k-mers em mature.fa
padroes de precursor em hairpin.fa (ideia historica, fora do fluxo vigente)
evidencia externa/literatura
```

Essa combinacao deve continuar sendo descrita como hipotese computacional ate passar por validacao biologica/laboratorial.

## Atualizacao: Dois Modelos para Descoberta de Novos Marcadores

> Versao vigente em 10/10/2026. A descricao metodologica completa, incluindo validacao, baselines, incerteza e limitacoes, esta em [`docs/METODOLOGIA_MODELOS_MIRNA.md`](docs/METODOLOGIA_MODELOS_MIRNA.md). Hairpin e estrutura secundaria foram removidos do pipeline ativo.

O foco principal do projeto foi ajustado. Os modelos antigos de classificacao de pacientes (`modelo_mirna_logistic.json` e `modelo_mirna_painel.json`) continuam no repositorio como historico, comparacao e suporte exploratorio, mas nao sao mais o fluxo principal do TCC.

O objetivo principal agora e:

```text
aprender padroes de k-mers, seed e composicao em sequencias maduras de miRNAs associados ao cancer de mama
-> encontrar novos miRNAs candidatos dentro do universo humano maduro do miRBase
-> validar computacionalmente se esses candidatos aparecem/separam pacientes doentes e saudaveis no dataset atual
```

Essa formulacao evita chamar miRNAs nao estudados de "nao cancerigenos", porque isso exigiria validacao biologica/laboratorial. O projeto trabalha com candidatos hipoteticos, nao com classificacao definitiva de cancerigeno vs nao cancerigeno.

### Modelo 1: Descoberta por Sequencia Madura

Scripts:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
```

Entradas:

```text
data/external/breast_cancer_mirna_positive_markers.csv
data/external/mirbase_mature.fa
data/external/breast_cancer_mirna_training_policy.csv
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
```

Saidas:

```text
models/modelo_mirna_candidate_discovery.json
data/processed/mirna_candidate_discovery_model_ranking.csv
reports/modelo_mirna_candidate_discovery_report.txt
```

Esse modelo e do tipo:

```text
bagged_positive_unlabeled_mature_sequence_model
```

Como funciona:

- usa os 43 miRNAs associados ao cancer de mama como positivos;
- aplica pesos explicitos definidos em `breast_cancer_mirna_training_policy.csv`: alta=3, media/painel inicial=2 e exploratoria=1;
- usa os demais miRNAs humanos maduros do miRBase como conjunto nao rotulado, nunca como negativos biologicos;
- mantem k-mers globais como nucleo e avalia seed, composicao, entropia, k-mers posicionais e motivos terminais 5p/3p da sequencia madura;
- testa, dentro da validacao aninhada, oito configuracoes com k entre 2 e 7, L2, Elastic Net e diferentes representacoes maduras;
- balanceia o peso positivo por familia de seed, preservando depois a massa total dos pesos de evidencia;
- treina um ensemble PU por bagging: cada bag usa todos os positivos e uma amostra diferente do conjunto nao rotulado como contraste temporario;
- calcula o modelo consenso pela media dos pesos e do vies de 20 bags e ranqueia cada candidato apenas com predicoes out-of-bag;
- registra estabilidade por candidato: mediana, quartis, IQR e frequencia nos top 1/5/10/20% entre bags OOB;
- ranqueia candidatos pela semelhanca aprendida com o perfil dos positivos;
- marca quais candidatos tem expressao disponivel no dataset para a validacao posterior.

A validacao e aninhada por familia de seed: 5 folds externos medem recuperacao e 3 folds internos escolhem a configuracao. Familias externas nao participam nem do treino nem da escolha de hiperparametros. A avaliacao usa todo o background nao rotulado elegivel e reporta Recall@1/5/10/20%, bootstrap por familia, teste nulo de ranking e quatro baselines.

Hairpin, estrutura secundaria e MFE foram excluidos deliberadamente do pipeline vigente para manter o escopo do TCC na sequencia madura e reduzir complexidade metodologica.

Execucao validada:

```text
Marcadores positivos: 43
Familias de seed: 32
Candidatos ranqueados no universo miRBase: 2613
Candidatos com expressao disponivel para validacao em pacientes: 611
Configuracao final: k234_positional_mature_l2_003_u050
Vocabulario final: 783 features
Percentil medio externo por familia: 0.6460 (IC95% 0.5585 a 0.7285; p nulo=0.0008)
Recall@1%: 0/32 (0.00%)
Recall@5%: 1/32 (3.13%)
Recall@10%: 4/32 (12.50%; IC95% 3.13% a 25.00%; p nulo=0.2417)
Recall@20%: 13/32 (40.63%)
```

Top 5 candidatos por padrao de sequencia madura aprendido:

```text
mir-2054
mir-1277-5p
mir-1277-3p
mir-8084
mir-374a-3p
```

O `score_modelo_sequencial` e o percentil do candidato pelo logit do ensemble. Valores proximos de 1 indicam maior suporte relativo da sequencia madura. A `probabilidade_pu_consenso_bruta` nao e probabilidade de cancer.

Observacao: candidatos sem expressao disponivel continuam no ranking global, mas nao entram no Modelo 2 no dataset atual.

Interpretacao dos resultados: o percentil medio apresenta sinal acima do nulo, mas o Recall@10% ainda nao e significativo. A nova representacao exclusivamente madura elevou o percentil de 0.6055 para 0.6460. Na ablação pareada, motivos terminais 5p/3p chegaram a 0.6829 e superaram o core em +0.0766 (IC95% 0.0123 a 0.1496; p nominal=0.0369; FDR BH=0.0738). Portanto, o resultado e promissor e exploratorio, mas nao permanece significativo a 5% depois da correcao das quatro comparacoes.

O mapeamento de nomes remove apenas sufixos que representam locus (`-1`, `-2` etc.) quando o nome realmente possui uma familia antes desse sufixo. Assim, nomes validos como `hsa-mir-574` nao sao truncados para `hsa-mir`; bracos com locus explicito, como `mir-16-1-3p`, tambem sao associados a familia precursora correta. Os caminhos gravados nos modelos e relatorios sao relativos a raiz do projeto, permitindo reproduzir a execucao em outra maquina.

### Modelo 2: Validacao Computacional em Pacientes

Script:

```powershell
node scripts\validate_mirna_candidates_in_patients_model.js
```

Entradas:

```text
data/processed/mirna_candidate_discovery_model_ranking.csv
models/modelo_mirna_candidate_discovery.json
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
```

Saidas:

```text
models/modelo_mirna_patient_candidate_validation.json
data/processed/mirna_patient_candidate_validation.csv
data/processed/mirna_patient_candidate_integrated_ranking.csv
reports/modelo_mirna_patient_candidate_validation_report.txt
```

Esse modelo e do tipo:

```text
patient_candidate_validation_models_per_candidate
```

Como funciona:

- recebe os candidatos gerados pelo Modelo 1;
- localiza as features correspondentes no dataset de pacientes;
- para cada candidato, executa regressao logistica univariada usando `log1p(expressao)`;
- usa validacao cruzada estratificada deterministica de 5 folds, com distribuicao estavel por hash de `sample_id` dentro de cada classe;
- cada amostra recebe uma predicao out-of-fold de um modelo que nao a utilizou no treino;
- agrega as predicoes out-of-fold para calcular AUC, accuracy, precision, recall, specificity e F1;
- calcula IC95% aproximado da AUC por Hanley-McNeil com estabilizacao de fronteira, p unilateral para `AUC > 0,5`, FDR Benjamini-Hochberg por hipotese de expressao unica, Cliff's delta, Hedges g e diferenca media log1p;
- identifica explicitamente quando diferentes bracos maduros compartilham a mesma feature de expressao;
- ajusta depois um modelo final em todas as amostras apenas para serializacao e uso futuro;
- calcula tambem log2 fold-change e presenca maior que zero;
- gera um `score_validacao_pacientes`;
- gera um ranking puro de validacao em pacientes;
- combina suporte da sequencia madura e suporte em pacientes em um ranking integrado por `score_final_descoberta`.
- produz cenarios 75/25 e 25/75 e uma fronteira de Pareto, reduzindo dependencia da escolha 50/50.

Formula:

```text
score_validacao_pacientes =
  0.70 * AUC_signal
+ 0.20 * |log2FC|_signal
+ 0.10 * detection_presence_signal

score_final_descoberta =
  0.50 * score_modelo_sequencial
+ 0.50 * score_validacao_pacientes
```

A regressao univariada usa otimizacao Newton-Raphson com regularizacao L2. A validacao cruzada substituiu o antigo corte unico 80/20 e reduz a dependencia de uma divisao especifica dos pacientes.

Execucao validada:

```text
Candidatos validados: 611
Candidatos recebidos do ranking sequencial global: 2613
Candidatos ignorados por falta de expressao no dataset: 2002
Hipoteses de expressao unicas: 325
Hipoteses unicas com FDR BH < 0.05 para AUC > 0.5: 278
Candidatos associados a essas hipoteses: 531
Candidatos com ambiguidade de braco por feature compartilhada: 552
Candidatos na fronteira de Pareto: 4
```

Top 5 por validacao em pacientes:

```text
mir-182-5p   validacao=1.0000  rank_integrado=13
mir-182-3p   validacao=1.0000  rank_integrado=60
let-7f-5p    validacao=1.0000  rank_integrado=2
let-7f-2-3p  validacao=1.0000  rank_integrado=22
let-7f-1-3p  validacao=1.0000  rank_integrado=25
```

Top 5 por score integrado:

```text
mir-32-3p    score_final=0.9965
let-7f-5p    score_final=0.9833
mir-32-5p    score_final=0.9734
mir-95-5p    score_final=0.9317
mir-200b-3p  score_final=0.9257
```

Arquivos de ranking:

```text
data/processed/mirna_patient_candidate_validation.csv
ranking puro do Modelo 2, ordenado por score_validacao_pacientes

data/processed/mirna_patient_candidate_integrated_ranking.csv
ranking integrado, ordenado por score_final_descoberta
```

Observacao cientifica importante: o dataset de expressao usa varias colunas em nivel de precursor/familia, como `hsa-mir-106b`, enquanto o ranking sequencial trabalha com miRNAs maduros, como `mir-106b-5p` e `mir-106b-3p`. Por isso, alguns candidatos maduros podem compartilhar a mesma feature de expressao e receber metricas identicas no Modelo 2. Nesses casos, o Modelo 2 valida a associacao da feature disponivel no dataset, nao distingue experimentalmente o braco maduro 5p vs 3p.

Interpretacao correta:

```text
Modelo 1 pergunta:
quais miRNAs recebem maior suporte dos padroes da sequencia madura aprendidos com os marcadores positivos conhecidos?

Modelo 2 pergunta:
desses candidatos, quais tambem mostram associacao computacional com pacientes doentes no dataset atual?
```

Essa segunda etapa funciona como uma validacao computacional, nao laboratorial. Se um candidato aparece no dataset e sua expressao separa doentes e saudaveis, ele ganha prioridade como hipotese biologica. Ainda assim, isso nao prova causalidade nem valida o biomarcador clinicamente.

A validacao cruzada melhora a estimativa interna, mas nao elimina dois limites: o ranking ainda e selecionado no mesmo dataset e as classes podem estar confundidas com fonte/lote. Os 278 resultados com FDR interno referem-se a 325 hipoteses de expressao unicas, nao a 611 testes independentes. Valores-p no piso numerico devem ser apresentados como `p<1e-16`, sem alegar precisao adicional. Por isso, o ranking foi posteriormente testado na coorte externa GSE73002 descrita abaixo.

### Versao Congelada e Proximo Passo Cientifico

Esta versao deve ser tratada como o pipeline **congelado antes da validacao externa**. O codigo, os hiperparametros, o ranking dos candidatos, as direcoes esperadas de expressao e os criterios estatisticos devem permanecer inalterados quando a nova coorte for analisada. No Git, o ponto congelado e identificado pela tag `pre-validacao-externa-v1`.

Isso evita ajustar o metodo depois de observar os resultados externos e reduz o risco de vazamento de informacao. Se futuramente houver uma mudanca metodologica, ela deve gerar uma nova versao claramente identificada; a coorte usada para avaliar a versao anterior nao deve ser reaproveitada como se ainda fosse uma validacao independente.

O repositorio pode ser publicado e apresentado como estudo computacional exploratorio com validacao externa. Os resultados nao devem ser descritos como validacao clinica ou confirmacao definitiva de novos biomarcadores. O pipeline congelado foi aplicado sem retreinamento a GSE73002; o plano e o codigo imediatamente anteriores aos resultados estao na tag `pre-resultados-gse73002-v1`.

A coorte externa ideal deve conter:

- pacientes com cancer de mama e controles sem cancer de mama;
- uma linha por amostra/paciente e identificadores que permitam excluir qualquer sobreposicao com a coorte atual;
- expressao de miRNAs maduros, preferencialmente incluindo os candidatos priorizados;
- o mesmo tipo de material biologico da coorte atual, sempre que possivel (por exemplo, tecido com tecido ou sangue com sangue);
- plataforma e processamento comparaveis, ou metadados suficientes para avaliar diferencas tecnicas;
- classe diagnostica clara e, se disponiveis, idade, subtipo tumoral, estagio, tratamento e lote experimental.

O minimo de 10 amostras por classe implementado no validador e apenas um piso tecnico, nao uma recomendacao de tamanho amostral. Como referencia operacional para o TCC, `30 + 30` permite uma avaliacao exploratoria mais defensavel, `50 + 50` ou mais e preferivel, e o tamanho final deve ser justificado por analise de poder quando os dados e o efeito esperado estiverem definidos. Independencia e compatibilidade da coorte sao tao importantes quanto o numero de amostras.

Na coorte externa, o pipeline deve ser executado **sem retreinamento e sem novo ajuste do ranking**. A interpretacao deve considerar conjuntamente:

- correspondencia exata do miRNA maduro, separada de proxy de familia;
- concordancia da direcao de expressao;
- AUC e seu intervalo de confianca;
- tamanho de efeito;
- FDR para multiplos testes;
- quantidade de candidatos que reproduzem o sinal segundo os criterios predefinidos.

O formato geral de novas bases esta detalhado em [`docs/FORMATO_COORTE_EXTERNA.md`](docs/FORMATO_COORTE_EXTERNA.md). O protocolo predefinido da GSE73002, incluindo hashes e criterios anteriores aos resultados, esta em [`docs/PLANO_VALIDACAO_EXTERNA_GSE73002.md`](docs/PLANO_VALIDACAO_EXTERNA_GSE73002.md).

### Fluxo Principal Atual

Executar:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
node scripts\audit_mirna_discovery_pipeline.js
```

Para reproduzir a preparacao e a validacao principal da GSE73002:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\prepare_gse73002_external_cohort.ps1
node --max-old-space-size=4096 scripts\validate_mirna_external_cohort.js data\processed\gse73002_external_validation_ts.csv --scale log2 --output-stem gse73002_ts_external_validation --cohort-label GSE73002_TS
node scripts\audit_gse73002_global_shift.js data\processed\gse73002_external_validation_ts.csv
node --max-old-space-size=4096 scripts\validate_mirna_external_cohort.js data\processed\gse73002_external_validation_ts.csv --scale log2 --sample-center mean --output-stem gse73002_ts_external_validation_centered_sensitivity --cohort-label GSE73002_TS_centered_posthoc
```

O validador exige que a escala seja declarada (`linear` ou `log2`), rejeita sobreposicao de `sample_id` e valores invalidos, prefere miRNAs maduros exatos, marca separadamente proxies e aplica ranking/direcoes congelados. O criterio de reproducao exige direcao concordante, limite inferior aproximado do IC95% da AUC acima de 0,5 e FDR abaixo de 0,05. AUC direcional de pelo menos 0,60 aparece apenas como filtro descritivo de magnitude, nao como limiar clinico.

### Resultado da Validacao Externa GSE73002

A analise principal usou somente a divisao de teste original (`TS`), formada por 1.206 amostras de soro de cancer de mama e 1.343 controles sem cancer. A matriz possui 2.540 miRNAs em escala log2 normalizada, e nenhuma transformacao logaritmica adicional foi aplicada.

```text
Candidatos congelados: 611
Mapeamento maduro exato: 579
Proxy de familia: 23
Ausentes: 9
Hipoteses externas distintas: 588
Replicacoes maduras exatas: 255
Replicacoes maduras exatas com AUC >= 0,60: 254
Replicacoes exatas sem ambiguidade interna de braco: 27
Top 10: 7/10 reproduzidos
Top 20: 13/19 encontrados reproduzidos
Top 50: 34/47
Top 100: 60/96
Spearman score integrado interno vs AUC externa: 0,0852
```

Quatro dos cinco primeiros candidatos integrados reproduziram: `mir-32-3p`, `let-7f-5p`, `mir-32-5p` e `mir-200b-3p`, nos ranks internos 1, 2, 3 e 5, com AUC direcional aproximada entre 0,958 e 0,965. `mir-95-5p`, rank 4, nao reproduziu a direcao esperada.

#### Auditoria de deslocamento global

A media das 2.540 medidas de cada amostra separou as classes com AUC 0,971. Alem disso, 2.430/2.540 miRNAs (95,67%) apresentaram media maior no grupo cancer. Esse padrao mostra um forte deslocamento global de coorte/processamento. Consequentemente, os 255 resultados nao devem ser chamados de 255 biomarcadores especificos confirmados.

A conferencia com a matriz processada oficial mostrou que `PACIENTE_0001 / hsa-let-7a-5p = 4,626` coincide com `GSM1877618 / MIMAT0000062 = 4,626041376`. Portanto, o deslocamento nao foi criado pela transposicao local; ele ja esta presente nos dados oficiais disponibilizados.

#### Sensibilidade centrada por amostra

Como diagnostico pos-resultado, foi subtraida a media dos 2.540 miRNAs de cada amostra e o mesmo ranking foi reaplicado sem retreino. Houve 271 replicacoes maduras exatas; 211 coincidiram com as 255 do resultado principal e 203 mantiveram AUC de pelo menos 0,60 nas duas analises. Nos 20 primeiros do ranking, os mesmos 13 sinais permaneceram robustos.

Como 552/611 candidatos do Modelo 2 interno usam features que nao distinguem completamente os bracos maduros, os 211 nao possuem todos o mesmo nivel de evidencia. Ao exigir simultaneamente correspondencia madura externa exata, reproducao nas duas analises e ausencia de ambiguidade interna 5p/3p, restam **22 candidatos**. Desses, **21** mantem AUC direcional de pelo menos 0,60 nas duas analises. Esse e o nucleo mais rigoroso para afirmacoes especificamente sobre miRNA maduro.

Essa sensibilidade nao substitui o resultado principal. A leitura defendivel e que existe um conjunto amplo de 211 sinais concordantes e um nucleo maduro estrito de 22 candidatos, mas a magnitude global do ranking nao se transporta bem e a coorte possui confundimento sistematico. Cinco dos 43 positivos do Modelo 1 tambem vieram da publicacao ligada a GSE73002; essa dependencia indireta esta declarada no plano.

Arquivos principais:

```text
docs/PLANO_VALIDACAO_EXTERNA_GSE73002.md
docs/ANALISE_SENSIBILIDADE_GSE73002.md
reports/gse73002_external_preparation_report.txt
reports/gse73002_provenance_check.txt
reports/gse73002_global_shift_audit.txt
reports/gse73002_ts_external_validation_report.txt
reports/gse73002_ts_external_validation_summary.json
reports/gse73002_ts_external_validation_centered_sensitivity_report.txt
data/processed/gse73002_ts_external_validation.csv
data/processed/gse73002_ts_external_validation_centered_sensitivity.csv
```

Consultar:

```text
reports/modelo_mirna_candidate_discovery_report.txt
reports/modelo_mirna_patient_candidate_validation_report.txt
data/processed/mirna_patient_candidate_validation.csv
data/processed/mirna_patient_candidate_integrated_ranking.csv
```

### Dashboard HTML dos Rankings

Foi adicionado um gerador de dashboard HTML para visualizar os rankings sem abrir os CSVs diretamente.

Script:

```powershell
node scripts\generate_mirna_rankings_html.js
```

Entradas:

```text
data/processed/mirna_candidate_discovery_model_ranking.csv
data/processed/mirna_patient_candidate_validation.csv
data/processed/mirna_patient_candidate_integrated_ranking.csv
```

Saida:

```text
reports/mirna_rankings_dashboard.html
```

O dashboard contem:

- cards com metricas gerais dos modelos;
- metricas do Modelo 2 calculadas a partir das predicoes out-of-fold da validacao cruzada;
- grafico `score_modelo_sequencial` vs `score_validacao_pacientes`;
- grafico do top 20 do ranking integrado;
- abas para ranking integrado, validacao em pacientes e Modelo 1 PU/sequencia madura;
- busca textual, paginacao e ordenacao por coluna.

Os graficos usam Plotly via CDN. Se o HTML for aberto sem internet, as tabelas continuam funcionando e os graficos podem ficar indisponiveis.

### Guia Didatico para Apresentacao

Foi criado um guia diagramado que explica, em linguagem de apresentacao, os conceitos biologicos, a quebra das sequencias em k-mers, os dois modelos e o significado pratico de cada metrica.

Arquivos:

```text
docs/GUIA_DIDATICO_PIPELINE_MIRNA.pdf
docs/GUIA_DIDATICO_PIPELINE_MIRNA.html
```

O HTML e reproduzido com:

```powershell
node scripts\generate_mirna_didactic_guide.js
```

O PDF foi impresso localmente a partir desse HTML em formato A4. Ele deve ser regenerado quando resultados, metodologia ou numeros do pipeline forem alterados.

### Status dos Modelos Antigos

Os modelos antigos continuam disponiveis:

```text
models/modelo_mirna_logistic.json
models/modelo_mirna_painel.json
```

Eles classificam amostras/pacientes como saudavel ou doente, mas nao sao mais o objetivo principal do projeto. Agora eles devem ser tratados como historico, comparacao ou apoio exploratorio, porque o objetivo cientifico principal passou a ser descoberta e priorizacao de novos miRNAs candidatos.
