# Projeto miRNA - Dataset Balanceado e Modelo Diagnóstico

Este projeto organiza, transforma e modela dados de expressão de miRNAs para uma tarefa de classificação binária:

- `classe = 0`: paciente saudável
- `classe = 1`: paciente doente

## Regra de Manutenção

Sempre que uma mudança alterar o contexto do projeto, atualize também:

```text
README.md
context.md
```

Isso vale para novos scripts, datasets, modelos, métricas, comandos, fluxos de predição, limitações ou mudanças na recomendação de uso.

O objetivo foi transformar uma matriz TXT grande de saudáveis para a mesma estrutura do CSV de doentes, balancear as classes em `1339 x 1339`, treinar modelos de IA e criar uma documentação reprodutível.

## Estrutura do Projeto

```text
miRNA/
├── data/
│   ├── raw/
│   │   ├── dataset_mirna_raw (doentes).csv
│   │   └── miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).txt
│   ├── external/
│   │   └── rnacentral_mirbase_mapping.tsv
│   └── processed/
│       ├── dataset_mirna_balanceado.csv
│       ├── dataset_mirna_balanceado_colunas_comuns.csv
│       └── dataset_mirna_painel_12_disponiveis.csv
├── models/
│   ├── modelo_mirna_logistic.json
│   └── modelo_mirna_painel.json
├── predictions/
│   ├── predicoes_teste_dataset.csv
│   └── predicoes_teste_painel.csv
├── reports/
│   ├── dataset_mirna_balanceado_report.txt
│   ├── modelo_mirna_metricas.txt
│   └── modelo_mirna_painel_metricas.txt
├── scripts/
│   ├── build_balanced_mirna_dataset.js
│   ├── train_mirna_logistic_model.js
│   ├── train_mirna_panel_model.js
│   ├── predict_mirna_with_model.js
│   └── predict_mirna_panel_model.js
└── README.md
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

## Evolucao: Descoberta de Candidatos por Sequencia

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
data/external/mirbase_hairpin.fa
```

O `mirbase_mature.fa` contem sequencias maduras de miRNAs do miRBase. O `mirbase_hairpin.fa` contem sequencias precursoras/stem-loop. Eles sao necessarios porque os CSVs atuais guardam expressao por amostra, mas nao guardam sequencias.

No pipeline atual, a descoberta sequencial usa `mirbase_mature.fa`. O `mirbase_hairpin.fa` foi adicionado como universo complementar para futuras analises em nivel de precursor, que combina melhor com varias colunas do CSV, como `hsa-mir-106a`.

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

Entrada complementar disponivel para evolucao futura:

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

Na execucao atual, o script encontrou 43/43 sequencias dos biomarcadores positivos e avaliou 221 candidatos humanos presentes na base. Os primeiros candidatos do ranking foram:

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

O projeto agora tem duas referencias do miRBase em `data/external/`:

```text
mirbase_mature.fa
mirbase_hairpin.fa
```

Uso recomendado:

- `mirbase_mature.fa`: universo de miRNAs maduros; usado atualmente pelo script de descoberta sequencial.
- `mirbase_hairpin.fa`: universo de precursores/stem-loop; disponivel para a proxima evolucao, especialmente porque os CSVs do projeto usam muitas features em nivel de precursor.

O arquivo curado de biomarcadores positivos de cancer de mama e:

```text
data/external/breast_cancer_mirna_positive_markers.csv
```

Esse arquivo contem:

- biomarcadores do painel inicial do projeto;
- lista consolidada de miRNAs encontrados em serum/soro enviada pelo usuario;
- classificacao por recorrencia bibliografica focada em serum/soro.

O script `scripts/discover_mirna_sequence_candidates.js` agora carrega esse CSV automaticamente. Portanto, quando novos biomarcadores forem encontrados, o caminho preferido e acrescentar novas linhas nesse arquivo.

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

### Como adicionar novos biomarcadores

Quando novos biomarcadores forem encontrados, editar:

```text
data/external/breast_cancer_mirna_positive_markers.csv
```

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
node scripts\discover_mirna_sequence_candidates.js
```

O script vai:

- carregar todos os biomarcadores positivos do CSV;
- encontrar as sequencias no `mirbase_mature.fa`;
- recalcular motifs/k-mers enriquecidos;
- recalcular o ranking de candidatos;
- atualizar `mirna_sequence_candidate_ranking.csv`, `modelo_mirna_sequence_patterns.json` e `mirna_sequence_candidate_discovery_report.txt`.

### Execucao apos incorporar a lista consolidada

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

### Evidencia integrada: sequencia + expressao + recorrencia

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
padroes de precursor em hairpin.fa
evidencia externa/literatura
```

Essa combinacao deve continuar sendo descrita como hipotese computacional ate passar por validacao biologica/laboratorial.

## Atualizacao: Dois Modelos para Descoberta de Novos Marcadores

O foco principal do projeto foi ajustado. Os modelos antigos de classificacao de pacientes (`modelo_mirna_logistic.json` e `modelo_mirna_painel.json`) continuam no repositorio como historico, comparacao e suporte exploratorio, mas nao sao mais o fluxo principal do TCC.

O objetivo principal agora e:

```text
aprender padroes de k-mers em miRNAs associados ao cancer de mama
-> encontrar novos miRNAs candidatos dentro da lista disponivel no projeto
-> validar computacionalmente se esses candidatos aparecem/separam pacientes doentes e saudaveis no dataset atual
```

Essa formulacao evita chamar miRNAs nao estudados de "nao cancerigenos", porque isso exigiria validacao biologica/laboratorial. O projeto trabalha com candidatos hipoteticos, nao com classificacao definitiva de cancerigeno vs nao cancerigeno.

### Modelo 1: Descoberta por K-mers

Script:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
```

Entradas:

```text
data/external/breast_cancer_mirna_positive_markers.csv
data/external/mirbase_mature.fa
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
trained_contrastive_one_class_kmer_model
```

Como funciona:

- usa miRNAs associados ao cancer de mama como positivos;
- usa outros miRNAs humanos presentes no dataset apenas como background nao rotulado;
- nao trata o background como "nao cancerigeno";
- extrai k-mers de tamanho 2, 3, 4 e 5;
- inclui a seed region como feature adicional;
- treina pesos para k-mers/seeds que diferenciam o perfil positivo do background;
- ranqueia candidatos pela semelhanca aprendida com o perfil dos positivos.

Execucao validada:

```text
Marcadores positivos com sequencia: 43
Candidatos avaliados com expressao disponivel: 221
Vocabulario aprendido: 608 features de k-mer/seed
LOPO percentil medio: 0.7013
LOPO positivos recuperados no top 10%: 30.23%
```

Top 5 candidatos por padrao sequencial aprendido:

```text
mir-6715a-3p
let-7c-5p
mir-106b-5p
mir-99b-5p
mir-323b-5p
```

O `score_modelo_sequencial` e o percentil do candidato pelo logit aprendido pelo modelo. Valores proximos de 1 indicam maior suporte sequencial relativo.

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
reports/modelo_mirna_patient_candidate_validation_report.txt
```

Esse modelo e do tipo:

```text
patient_candidate_validation_models_per_candidate
```

Como funciona:

- recebe os candidatos gerados pelo Modelo 1;
- localiza as features correspondentes no dataset de pacientes;
- para cada candidato, treina uma regressao logistica univariada usando `log1p(expressao)`;
- testa se a expressao desse candidato ajuda a separar `classe=1` doente de `classe=0` saudavel;
- calcula AUC, accuracy, precision, recall, specificity, F1, log2 fold-change e presenca maior que zero;
- gera um `score_validacao_pacientes`;
- combina suporte sequencial e suporte em pacientes em um `score_final_descoberta`.

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

Execucao validada:

```text
Candidatos validados: 221
```

Top 5 por score final:

```text
mir-106b-5p  score_final=0.9955
let-7f-5p    score_final=0.9795
let-7c-5p    score_final=0.9698
mir-323b-5p  score_final=0.9542
let-7i-5p    score_final=0.9249
```

Interpretacao correta:

```text
Modelo 1 pergunta:
quais miRNAs parecem sequencialmente com os marcadores positivos conhecidos?

Modelo 2 pergunta:
desses candidatos, quais tambem mostram associacao computacional com pacientes doentes no dataset atual?
```

Essa segunda etapa funciona como uma validacao computacional, nao laboratorial. Se um candidato aparece no dataset e sua expressao separa doentes e saudaveis, ele ganha prioridade como hipotese biologica. Ainda assim, isso nao prova causalidade nem valida o biomarcador clinicamente.

### Fluxo Principal Atual

Executar:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
```

Consultar:

```text
reports/modelo_mirna_candidate_discovery_report.txt
reports/modelo_mirna_patient_candidate_validation_report.txt
data/processed/mirna_patient_candidate_validation.csv
```

### Status dos Modelos Antigos

Os modelos antigos continuam disponiveis:

```text
models/modelo_mirna_logistic.json
models/modelo_mirna_painel.json
```

Eles classificam amostras/pacientes como saudavel ou doente, mas nao sao mais o objetivo principal do projeto. Agora eles devem ser tratados como historico, comparacao ou apoio exploratorio, porque o objetivo cientifico principal passou a ser descoberta e priorizacao de novos miRNAs candidatos.
