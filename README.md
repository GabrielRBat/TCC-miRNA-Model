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
