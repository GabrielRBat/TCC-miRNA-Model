# Contexto Operacional do Projeto miRNA

Este arquivo existe para permitir continuar o projeto em uma nova sessão dizendo apenas:

```text
leia o context.md
```

Ele documenta o estado atual, decisões técnicas, estrutura de arquivos, comandos, modelos treinados, limitações e próximos passos.

## Regra Obrigatória de Manutenção

Sempre que uma alteração nova interferir no contexto do projeto, este arquivo deve ser atualizado junto com o `README.md`.

Isso inclui, mas não se limita a:

- criação, remoção ou renomeação de arquivos;
- mudança na estrutura de diretórios;
- alteração em scripts;
- alteração em datasets;
- novo modelo treinado;
- novas métricas;
- novo fluxo de predição;
- novas limitações descobertas;
- novos comandos recomendados;
- mudança na recomendação de qual dataset/modelo usar.

Regra prática para futuras sessões:

```text
Se a mudança afetar como entender, reproduzir, testar ou continuar o projeto, atualize README.md e context.md na mesma rodada.
```

## Resumo do Objetivo

O projeto trabalha com classificação binária usando expressão de miRNAs:

- `classe = 0`: saudável
- `classe = 1`: doente

O usuário tinha dois arquivos originais:

1. Um CSV com miRNAs de pacientes doentes.
2. Um TXT grande com miRNAs de pacientes saudáveis.

O objetivo inicial foi:

- transformar o TXT de saudáveis para a mesma estrutura do CSV de doentes;
- selecionar 1339 amostras saudáveis;
- juntar com 1339 amostras doentes;
- gerar um dataset balanceado;
- treinar modelos de IA;
- documentar tudo.

O objetivo principal atual evoluiu para descoberta de candidatos ao cancer de mama. O fluxo vigente mantem os classificadores antigos como historico e usa dois modelos: o Modelo 1 e um ensemble PU que aprende somente padroes da sequencia madura — k-mers globais e posicionais, seed, composicao e motivos terminais — a partir de 43 biomarcadores balanceados por familia; o Modelo 2 avalia a expressao com predicoes out-of-fold em 5 folds. Hairpin e estrutura foram removidos do fluxo ativo. A especificacao vigente esta em `docs/METODOLOGIA_MODELOS_MIRNA.md`.

## Ambiente

Diretório de trabalho:

```text
C:\Users\ACS INFO PC\Downloads\miRNA
```

Shell:

```text
PowerShell
```

Python local apresentou problema:

```text
python.exe apontava para WindowsApps e falhava com "Não é possível o acesso ao arquivo pelo sistema"
```

Por isso os scripts foram implementados em Node.js.

Node disponível:

```text
v22.13.0
```

Todos os scripts devem ser executados a partir da raiz do projeto:

```powershell
cd "C:\Users\ACS INFO PC\Downloads\miRNA"
```

## Estrutura Atual

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
│   ├── generate_mirna_rankings_html.js
│   └── audit_mirna_discovery_pipeline.js
├── README.md
└── context.md
```

## Estado de Versionamento e GitHub

O projeto foi publicado no GitHub com sucesso.

Repositório remoto:

```text
https://github.com/GabrielRBat/TCC-miRNA-Model.git
```

Remoto local:

```text
origin
```

Branch local:

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

Situação que foi resolvida:

- `git pull` falhava porque a branch `master` não tinha tracking remoto.
- O repositório remoto parecia vazio.
- O comando correto era `git push -u origin master`.
- Antes do push, o raw saudável de 144 MB foi substituído no commit por um subset de aproximadamente 13 MB, porque GitHub rejeita arquivos acima de 100 MB.
- O push final foi realizado com sucesso e `master` passou a rastrear `origin/master`.

## Arquivos Originais

### `data/raw/dataset_mirna_raw (doentes).csv`

CSV original de doentes.

Formato:

```text
sample_id,classe,hsa-let-7a-1,hsa-let-7a-2,...
```

Resumo:

- 1339 linhas de dados.
- Classe original: `1`.
- Cada linha é uma amostra.
- Cada coluna após `classe` é um miRNA.
- Número de colunas no CSV original: 1883.
- Número de features miRNA: 1881.

### `data/raw/miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).txt`

TXT de saudáveis em formato de matriz.

Estado atual importante:

- O arquivo versionado não é mais o raw completo de 144 MB.
- Ele foi substituído por um subset com 1500 amostras saudáveis que não foram usadas no dataset balanceado inicial.
- O objetivo da substituição foi permitir publicação no GitHub, já que GitHub rejeita arquivos acima de 100 MB.

Formato observado:

```text
        GTEX-1117F-...    GTEX-...
URS...  valor             valor
URS...  valor             valor
```

Resumo:

- Arquivo versionado atual: aproximadamente 13 MB.
- Separado por tab.
- Amostras GTEx nas colunas.
- miRNAs/IDs RNAcentral nas linhas.
- Primeira coluna usa IDs `URS...`, não nomes `hsa-*`.
- Total no subset versionado:
  - 1501 colunas
  - 1500 amostras saudáveis
- As primeiras 1339 amostras do raw completo foram puladas porque já tinham sido usadas no dataset balanceado.
- O subset selecionou as amostras de índice 1340 até 2839 do TXT completo original.
- Primeira amostra do subset:
  - `GTEX-12WSN-0126-SM-EAL46`
- Última amostra do subset:
  - `GTEX-13QIC-1226-SM-F39ZB`

Backup local do raw completo:

```text
data/raw/_local_full_raw/miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).full.txt
```

Esse backup tem aproximadamente 144 MB e está ignorado pelo Git via `.gitignore`.

Não remover esse backup sem confirmação explícita do usuário.

## Mapeamento RNAcentral/miRBase

Arquivo baixado:

```text
data/external/rnacentral_mirbase_mapping.tsv
```

Fonte:

```text
https://ftp.ebi.ac.uk/pub/databases/RNAcentral/current_release/id_mapping/database_mappings/mirbase.tsv
```

Foi necessário porque:

- o TXT saudável usa IDs `URS...`;
- o CSV de doentes usa nomes `hsa-mir-*`;
- era preciso mapear IDs RNAcentral para nomes miRBase.

Observação técnica importante:

- O CSV de doentes está em nível de precursor/stem-loop, por exemplo `hsa-mir-106a`.
- O TXT saudável tem IDs que bateram melhor com miRNAs maduros, por exemplo `hsa-miR-106a-5p`.
- O script agregou miRNAs maduros por nome base removendo sufixos como `-5p` e `-3p` para preencher colunas precursoras quando possível.

## Transformação dos Dados

Script responsável:

```text
scripts/build_balanced_mirna_dataset.js
```

Comando:

```powershell
node scripts\build_balanced_mirna_dataset.js
```

Esse script:

1. Lê o CSV de doentes.
2. Lê o TXT transposto de saudáveis.
3. Usa o mapeamento RNAcentral/miRBase.
4. Seleciona as primeiras 1339 amostras saudáveis.
5. Cria `classe = 0` para saudáveis.
6. Mantém `classe = 1` para doentes.
7. Gera dataset balanceado completo.
8. Gera dataset filtrado só com colunas comuns válidas.
9. Gera relatório de mapeamento.

Saídas:

```text
data/processed/dataset_mirna_balanceado.csv
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
reports/dataset_mirna_balanceado_report.txt
```

Observação importante:

- Os datasets processados atuais foram criados antes da substituição do raw completo.
- Se `scripts/build_balanced_mirna_dataset.js` for reexecutado agora, ele usará o subset de 1500 amostras saudáveis não usadas como fonte.
- Isso pode gerar um dataset balanceado diferente do original.
- Para reproduzir exatamente os datasets atuais a partir do começo, seria necessário usar o backup local completo ou restaurar o raw completo.

### Subset saudável para GitHub

Script:

```text
scripts/create_unused_healthy_raw_subset.js
```

Comando:

```powershell
node scripts\create_unused_healthy_raw_subset.js
```

Esse script:

1. Move o raw saudável completo para `data/raw/_local_full_raw/`.
2. Cria um subset saudável menor no caminho original.
3. Pula as primeiras 1339 amostras já usadas no dataset balanceado.
4. Seleciona as 1500 amostras seguintes.
5. Mantém todas as linhas de miRNA/features do TXT original.

Arquivos relacionados:

```text
.gitignore
scripts/create_unused_healthy_raw_subset.js
data/raw/miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).txt
data/raw/_local_full_raw/miRNA_TPM_matrix_PORTAL_2025_03_17 (saudaveis).full.txt
```

O `.gitignore` inclui:

```text
data/raw/_local_full_raw/
data/raw/*.tmp
```

## Datasets Processados

### `data/processed/dataset_mirna_balanceado.csv`

Dataset completo, mantendo todas as colunas do CSV original.

Resumo validado:

```text
linhas de dados: 2678
classe 0: 1339
classe 1: 1339
colunas: 1883
```

Importante:

- Este arquivo preserva todas as 1881 features do CSV original.
- Onde não houve correspondência válida no TXT saudável, valores saudáveis podem ter ficado como `0`.
- Não é o mais recomendado para modelagem, porque pode introduzir artefato.

### `data/processed/dataset_mirna_balanceado_colunas_comuns.csv`

Dataset recomendado para modelagem geral.

Resumo validado:

```text
linhas de dados: 2678
classe 0: 1339
classe 1: 1339
colunas: 373
features miRNA: 371
```

Importante:

- Mantém apenas miRNAs que foram preenchidos de forma válida nos saudáveis e doentes.
- Evita treinar em colunas zeradas artificialmente.
- Foi usado no modelo baseline e como base para o painel.

### `data/processed/dataset_mirna_painel_12_disponiveis.csv`

Dataset focado no painel biológico informado pelo usuário.

O usuário informou um painel diagnóstico de 12 miRNAs séricos:

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

Contexto biológico dado pelo usuário:

- O painel teve AUCs relatadas:
  - 0.952 treinamento
  - 0.956 teste
  - 0.941 dados combinados
  - 0.950 coorte externa
- Em tecidos tumorais e adjacentes:
  - `miR-16-5p`, `miR-106a-5p`, `miR-25-3p`, `miR-425-5p`, `miR-93-5p` estavam upregulated.
  - `let-7b-5p` estava downregulated no tecido maligno.
- Em exossomos séricos:
  - exceto `miR-20a-5p` e `miR-223-3p`, os outros 10 estavam aumentados.

Marcadores disponíveis no dataset final:

```text
let-7b-5p      -> hsa-let-7b
miR-106a-5p    -> hsa-mir-106a
miR-19a-3p     -> hsa-mir-19a
miR-19b-3p     -> média de hsa-mir-19b-1 e hsa-mir-19b-2
miR-20a-5p     -> hsa-mir-20a
miR-25-3p      -> hsa-mir-25
miR-92a-3p     -> média de hsa-mir-92a-1 e hsa-mir-92a-2
miR-93-5p      -> hsa-mir-93
```

Marcadores ausentes no dataset seguro:

```text
miR-223-3p     -> desejado hsa-mir-223
miR-425-5p     -> desejado hsa-mir-425
miR-451a       -> desejado hsa-mir-451a
miR-16-5p      -> desejado hsa-mir-16-1 e hsa-mir-16-2
```

Motivo da ausência:

- As colunas existem no CSV completo de doentes, mas não tiveram correspondência válida no TXT saudável após o mapeamento.
- Não foram incluídas no painel seguro para evitar ensinar o modelo com zeros artificiais nos saudáveis.

## Modelos Criados

Foram criados dois modelos porque eles têm finalidades diferentes.

### Modelo Baseline

Arquivo:

```text
models/modelo_mirna_logistic.json
```

Script:

```text
scripts/train_mirna_logistic_model.js
```

Comando:

```powershell
node scripts\train_mirna_logistic_model.js
```

Dataset:

```text
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
```

Características:

- Usa 371 miRNAs.
- Algoritmo: regressão logística binária.
- Transformação: `log1p(max(valor, 0))`.
- Padronização usando média e desvio padrão do treino.
- Split treino/teste estratificado 80/20.
- Classe positiva: `1 = doente`.
- Classe negativa: `0 = saudável`.

Métricas observadas:

```text
Teste:
accuracy = 100.00%
precision = 100.00%
recall = 100.00%
AUC = 1.0000
```

Uso:

- Exploração geral.
- Ver se todo o conjunto de miRNAs comuns separa saudáveis e doentes.
- Comparação com o modelo do painel.

Limitação:

- Menos interpretável.
- Maior risco de capturar diferença de lote/fonte, não só doença.

### Modelo do Painel

Arquivo:

```text
models/modelo_mirna_painel.json
```

Script:

```text
scripts/train_mirna_panel_model.js
```

Comando:

```powershell
node scripts\train_mirna_panel_model.js
```

Dataset:

```text
data/processed/dataset_mirna_painel_12_disponiveis.csv
```

Características:

- Usa os 8 marcadores disponíveis do painel biológico.
- Algoritmo: regressão logística binária.
- Transformação: média de colunas precursoras quando necessário, depois `log1p`.
- Padronização usando média e desvio padrão do treino.
- Split treino/teste estratificado 80/20.

Métricas observadas:

```text
Teste:
accuracy = 99.44%
precision = 100.00%
recall = 98.88%
AUC = 1.0000
```

Pesos observados na última execução:

```text
miR-106a-5p   positivo, puxa para doente
miR-93-5p     positivo, puxa para doente
miR-19b-3p    negativo, puxa para saudável
miR-92a-3p    negativo, puxa para saudável
miR-25-3p     positivo, puxa para doente
let-7b-5p     positivo, puxa para doente
miR-20a-5p    positivo, puxa para doente
miR-19a-3p    negativo, puxa para saudável
```

Observação:

- Alguns pesos ficaram contra a direção biológica esperada, especialmente `miR-19b-3p` e `miR-92a-3p`.
- Isso reforça o risco de efeito de lote/fonte ou diferença de processamento.

Uso recomendado:

- Este é o modelo principal no estado atual, porque é biologicamente guiado.
- O baseline fica como comparação exploratória.

## Diferença entre Baseline e Painel

Baseline:

- Usa 371 miRNAs.
- Melhor para exploração ampla.
- Menos interpretável.
- Maior risco de aprender ruído ou lote.

Painel:

- Usa marcadores definidos biologicamente pelo usuário.
- Mais interpretável.
- Mais próximo de um teste diagnóstico.
- Atualmente usa 8 dos 12 marcadores porque 4 não têm dados saudáveis válidos.

Recomendação atual:

```text
Usar o modelo do painel como principal.
Usar o baseline apenas como comparação.
```

## Scripts de Predição

### Predição com baseline

Script:

```text
scripts/predict_mirna_with_model.js
```

Comando:

```powershell
node scripts\predict_mirna_with_model.js arquivo_novo.csv predictions\predicoes.csv
```

Entrada precisa conter as colunas usadas pelo baseline.

### Predição com painel

Script:

```text
scripts/predict_mirna_panel_model.js
```

Comando:

```powershell
node scripts\predict_mirna_panel_model.js arquivo_novo.csv predictions\predicoes_painel.csv
```

Entrada precisa conter pelo menos estas colunas:

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

Saída:

```text
sample_id,probabilidade_doente,classe_predita
```

Interpretação:

```text
probabilidade_doente >= 0.5 -> classe_predita = 1
probabilidade_doente < 0.5  -> classe_predita = 0
```

## Teste com Dataset Novo

O usuário planeja criar dois arquivos para teste:

1. Dataset com a coluna `classe`, usado como verdade/gabarito.
2. Dataset sem a coluna `classe`, usado para o modelo predizer.

Essa abordagem é adequada para testar o fluxo desde que as amostras sejam independentes, ou seja, não copiadas do dataset usado no treino.

Formato recomendado para o dataset com verdade:

```text
sample_id,classe,hsa-let-7b,hsa-mir-106a,hsa-mir-19a,hsa-mir-19b-1,hsa-mir-19b-2,hsa-mir-20a,hsa-mir-25,hsa-mir-92a-1,hsa-mir-92a-2,hsa-mir-93
```

Formato recomendado para o dataset sem verdade:

```text
sample_id,hsa-let-7b,hsa-mir-106a,hsa-mir-19a,hsa-mir-19b-1,hsa-mir-19b-2,hsa-mir-20a,hsa-mir-25,hsa-mir-92a-1,hsa-mir-92a-2,hsa-mir-93
```

Predizer:

```powershell
node scripts\predict_mirna_panel_model.js caminho\dataset_sem_classe.csv predictions\predicoes_dataset_novo.csv
```

Depois comparar:

```text
classe real do dataset com verdade
vs
classe_predita gerada pelo modelo
```

Ainda não há script de avaliação desse novo gabarito. Próximo passo útil:

```text
criar script para comparar dataset_com_classe.csv com predicoes.csv e calcular accuracy, precision, recall, specificity, F1, AUC e matriz de confusão.
```

## Relatórios

### `reports/dataset_mirna_balanceado_report.txt`

Contém:

- linhas de doentes copiadas;
- linhas saudáveis adicionadas;
- total final;
- colunas preenchidas;
- colunas sem mapeamento;
- exemplos de mapeamento.

### `reports/modelo_mirna_metricas.txt`

Contém métricas do baseline:

- accuracy;
- precision;
- recall/sensibilidade;
- specificity;
- F1;
- AUC;
- matriz de confusão;
- top miRNAs por peso positivo/negativo.

### `reports/modelo_mirna_painel_metricas.txt`

Contém métricas do modelo do painel:

- marcadores usados;
- marcadores ausentes;
- métricas de treino e teste;
- pesos aprendidos.

## README

Arquivo:

```text
README.md
```

Ele documenta o projeto para leitura humana:

- objetivo;
- estrutura;
- dados;
- scripts;
- modelos;
- comandos;
- limitações;
- próximos passos.

Se alterar scripts, datasets ou modelos, atualizar também:

```text
README.md
context.md
```

## Validações Já Feitas

Validação de balanceamento:

```text
dataset_mirna_balanceado.csv:
rows = 2678
columns = 1883
class0 = 1339
class1 = 1339

dataset_mirna_balanceado_colunas_comuns.csv:
rows = 2678
columns = 373
class0 = 1339
class1 = 1339
```

Scripts testados após reorganização de pastas:

```powershell
node scripts\train_mirna_panel_model.js
node scripts\train_mirna_logistic_model.js
node scripts\predict_mirna_panel_model.js data\processed\dataset_mirna_balanceado_colunas_comuns.csv predictions\predicoes_teste_painel.csv
```

Todos rodaram com sucesso.

## Limitações e Cuidado Científico

As métricas ficaram muito altas. Isso é útil tecnicamente, mas cientificamente precisa de cautela.

Possíveis explicações:

- sinal real da doença;
- efeito de lote;
- diferença de origem dos dados;
- diferença de pipeline;
- saudáveis GTEx vs doentes de outra fonte;
- amostras com características técnicas distintas;
- marcadores ausentes preenchidos/filtrados.

Não tratar o modelo como diagnóstico clínico validado sem:

- coorte externa independente;
- dados processados pelo mesmo pipeline;
- validação cruzada adequada;
- correção de batch effect;
- revisão com especialista;
- comparação com literatura.

## Próximos Passos Recomendados

1. Criar script de avaliação de predição externa:
   - entrada 1: dataset com `classe` real;
   - entrada 2: arquivo de predições;
   - saída: métricas e matriz de confusão.

2. Testar novo dataset independente criado pelo usuário:
   - uma versão com classe;
   - uma versão sem classe;
   - prever na versão sem classe;
   - avaliar contra a versão com classe.

3. Se possível, obter saudáveis contendo os 12 miRNAs completos:
   - `miR-223-3p`
   - `miR-425-5p`
   - `miR-451a`
   - `miR-16-5p`

4. Recriar modelo do painel com 12 marcadores completos.

5. Implementar validação cruzada k-fold para o painel.

6. Considerar modelos adicionais:
   - SVM;
   - Random Forest;
   - XGBoost se houver ambiente com dependências;
   - regressão logística com regularização ajustada.

7. Criar interface simples para predição:
   - CLI mais amigável;
   - ou app local para carregar CSV e baixar resultado.

## Instruções para Nova Sessão

Ao iniciar nova sessão:

1. Ler este arquivo.
2. Verificar estrutura com:

```powershell
Get-ChildItem -Recurse -File | Select-Object FullName,Length
```

3. Se a tarefa for continuar modelagem, priorizar:

```text
data/processed/dataset_mirna_painel_12_disponiveis.csv
models/modelo_mirna_painel.json
scripts/train_mirna_panel_model.js
scripts/predict_mirna_panel_model.js
```

4. Se o usuário trouxer dataset novo para teste, criar ou usar script de avaliação externa.

5. Não apagar dados brutos.

6. Manter documentação atualizada:

```text
README.md
context.md
```

## Estado Atual Final

O projeto está organizado, documentado e funcional.

Dataset mais seguro para modelagem ampla:

```text
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
```

Dataset mais alinhado ao painel biológico:

```text
data/processed/dataset_mirna_painel_12_disponiveis.csv
```

Modelo principal recomendado:

```text
models/modelo_mirna_painel.json
```

Script principal de treino:

```text
scripts/train_mirna_panel_model.js
```

Script principal de predição:

```text
scripts/predict_mirna_panel_model.js
```

Documentação principal:

```text
README.md
context.md
```

## Historico: Primeira Descoberta de Candidatos por Padroes Sequenciais

Esta secao registra a primeira abordagem exploratoria, anterior ao fluxo vigente de dois modelos. Ela usava apenas sequencias maduras e permanece documentada para rastreabilidade. A implementacao principal atual esta em "Atualizacao Operacional: Dois Modelos para Descoberta de Candidatos".

### Contexto do Problema

O projeto funcionava principalmente como um pipeline de expressao de miRNAs:

- transformar dados saudaveis e doentes para uma estrutura comum;
- treinar um baseline com 371 miRNAs comuns;
- treinar um modelo principal guiado por um painel biologico de 12 marcadores conhecidos;
- predizer probabilidade de doenca em amostras novas.

Essa abordagem e util para classificacao, mas o modelo do painel usa marcadores ja definidos pela literatura. Ele confirma e operacionaliza marcadores conhecidos, mas nao descobre novos miRNAs candidatos.

O novo objetivo cientifico/computacional e adicionar uma camada de descoberta:

```text
Aprender padroes estruturais/sequenciais presentes nos 12 marcadores conhecidos e ranquear outros miRNAs humanos que compartilham esses padroes.
```

O resultado deve ser tratado como hipotese computacional, nao como diagnostico ou biomarcador validado.

### Como os Marcadores Estavam Representados Antes

Antes desta alteracao, os 12 marcadores estavam representados de tres formas:

1. Como nomes de marcador no script:

```text
scripts/train_mirna_panel_model.js
```

2. Como colunas precursoras ou agregacoes de colunas no dataset de expressao:

```text
data/processed/dataset_mirna_painel_12_disponiveis.csv
```

3. Como pesos de regressao logistica no modelo do painel:

```text
models/modelo_mirna_painel.json
```

Nao havia sequencias nos CSVs processados. Os arquivos de expressao guardavam valores por amostra, nao a sequencia biologica de cada miRNA.

### O Que Foi Alterado

Foi criada uma nova etapa independente, sem remover a funcionalidade atual.

Novo arquivo externo:

```text
data/external/mirbase_mature.fa
data/external/mirbase_hairpin.fa
```

O `mirbase_mature.fa` contem sequencias maduras do miRBase e foi adicionado porque o projeto nao tinha sequencias internas. O `mirbase_hairpin.fa` contem sequencias precursoras/stem-loop e foi baixado depois como universo complementar, mais proximo do nivel de varias colunas do CSV, como `hsa-mir-106a`.

Estado atual:

```text
scripts/discover_mirna_sequence_candidates.js usa mirbase_mature.fa
mirbase_hairpin.fa era complementar na camada historica descrita aqui; o experimento posterior com precursores tambem se tornou historico e o Modelo 1 vigente usa somente sequencia madura
```

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

Comando:

```powershell
node scripts\discover_mirna_sequence_candidates.js
```

Resultado da execucao validada:

```text
Biomarcadores positivos solicitados: 43
Biomarcadores positivos com sequencia encontrada: 43
Candidatos humanos avaliados: 221
```

Top 5 candidatos daquela execucao historica:

```text
mir-449a       score=0.6500
mir-20b-5p     score=0.6381
let-7i-5p      score=0.6316
let-7c-5p      score=0.6297
mir-526b-3p    score=0.6270
```

### Logica de Extracao de Padroes

O script localiza no FASTA as sequencias maduras dos biomarcadores positivos carregados de:

```text
data/external/breast_cancer_mirna_positive_markers.csv
data/external/breast_cancer_mirna_training_policy.csv
```

Depois extrai k-mers de tamanho:

```text
k = 2, 3, 4, 5
```

K-mers sao subsequencias contiguas. Por exemplo, para uma sequencia contendo `AUGCU`, k-mers de tamanho 3 incluem `AUG`, `UGC` e `GCU`.

Motifs recorrentes sao identificados como k-mers presentes em mais de um marcador e enriquecidos em relacao ao conjunto de miRNAs humanos avaliados.

Exemplos de motifs enriquecidos encontrados naquela execucao historica:

```text
AAAAC
AAAUA
AUGCA
CCGUU
CAAAU
GCAGG
CAGGU
UUGUC
```

### Logica de Vetorizacao

Cada sequencia e transformada em um vetor esparso de frequencias normalizadas de k-mers.

Motivo:

- nomes como `miR-20a` ou `miR-20b` nao devem ser a feature principal;
- a representacao por k-mers permite comparar padroes internos da sequencia;
- a similaridade passa a depender da composicao sequencial, nao apenas do identificador.

O script calcula um centroide dos biomarcadores positivos, ou seja, o vetor medio das sequencias usadas como referencia.

### Logica de Similaridade e Score

Para cada candidato, o script calcula:

- similaridade cosseno com o centroide dos marcadores;
- maior similaridade cosseno com um marcador individual;
- cobertura dos motifs enriquecidos;
- similaridade da regiao seed, usando posicoes 2 a 8 da sequencia madura;
- evidencia auxiliar do modelo baseline de expressao, apenas informativa.

Formula do score:

```text
0.50 * similaridade com centroide dos marcadores
+ 0.25 * similaridade com marcador mais proximo
+ 0.15 * cobertura de motifs enriquecidos
+ 0.10 * similaridade da regiao seed
```

O score e chamado de `score_hipotese` no CSV porque nao e probabilidade clinica.

### Relatorio Final

Relatorio gerado:

```text
reports/mirna_sequence_candidate_discovery_report.txt
```

Ele contem:

- os biomarcadores positivos usados como referencia;
- accession miRBase, sequencia e seed de cada marcador;
- motifs/k-mers enriquecidos;
- pares de marcadores com maior similaridade;
- novos candidatos ranqueados;
- score de cada candidato;
- marcadores mais proximos;
- motifs compartilhados;
- aviso cientifico.

CSV detalhado:

```text
data/processed/mirna_sequence_candidate_ranking.csv
```

Modelo/artefato do perfil sequencial:

```text
models/modelo_mirna_sequence_patterns.json
```

### Observacao Sobre a Base de Candidatos

O FASTA do miRBase contem muitas sequencias humanas. Para manter coerencia com o projeto atual, o script so ranqueia candidatos que podem ser associados a features presentes em:

```text
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
```

Como o dataset de expressao usa muitas colunas em nivel de precursor e o FASTA usa miRNAs maduros, o script faz mapeamento por nome-base/familia:

```text
hsa-miR-20b-5p -> hsa-mir-20b
hsa-let-7a-5p -> hsa-let-7a
```

Foi corrigido um cuidado importante na normalizacao: remover apenas sufixos reais de braco maduro `-5p` e `-3p`. Isso evita mapear indevidamente nomes como `miR-548p` para uma familia generica incorreta.

### Limitacoes da Nova Abordagem

- A nova etapa aprende similaridade sequencial, nao associacao causal com cancer de mama.
- O ranking e one-class/prototipico: usa positivos conhecidos, mas nao tem um conjunto confiavel de negativos biologicos.
- Candidatos da mesma familia dos marcadores tendem a subir no ranking por similaridade natural.
- O score nao substitui expressao diferencial, validacao experimental, coorte externa ou revisao biologica.
- O arquivo de expressao e o FASTA usam niveis biologicos diferentes, precursor versus miRNA maduro.
- Os pesos do baseline aparecem como evidencia auxiliar, mas nao entram no score final.

### Proximos Passos Recomendados para Esta Camada

1. Validar os candidatos ranqueados contra literatura e bancos de alvos de miRNA.
2. Combinar score sequencial com analise de expressao diferencial entre saudaveis e doentes.
3. Verificar alvos e vias biologicas relacionadas a cancer de mama.
4. Testar a lista em coorte externa independente.
5. Se houver exemplos confiaveis de miRNAs nao associados, treinar modelo supervisionado em vez de usar apenas perfil one-class.
6. Considerar sequencias precursoras/hairpin alem de sequencias maduras, se a pergunta biologica exigir estrutura secundaria.

### Estado Atual Apos a Alteracao

Pipeline antigo preservado:

```text
scripts/train_mirna_panel_model.js
scripts/predict_mirna_panel_model.js
models/modelo_mirna_painel.json
```

Nova camada adicionada:

```text
scripts/discover_mirna_sequence_candidates.js
data/external/mirbase_mature.fa
data/processed/mirna_sequence_candidate_ranking.csv
models/modelo_mirna_sequence_patterns.json
reports/mirna_sequence_candidate_discovery_report.txt
```

Comando principal da nova camada:

```powershell
node scripts\discover_mirna_sequence_candidates.js
```

### Atualizacao Consolidada: Universo miRBase e Lista Curada Serum/Soro

Foi baixado tambem:

```text
data/external/mirbase_hairpin.fa
```

Estado das referencias externas de sequencia:

```text
data/external/mirbase_mature.fa   -> universo de miRNAs maduros
data/external/mirbase_hairpin.fa  -> universo de precursores/stem-loop
```

Uso atual:

- `scripts/discover_mirna_sequence_candidates.js` usa `mirbase_mature.fa`.
- `mirbase_hairpin.fa` foi incorporado ao Modelo 1 principal para representar padroes de precursor.

Arquivo curado atual de biomarcadores positivos/candidatos:

```text
data/external/breast_cancer_mirna_positive_markers.csv
```

Esse arquivo contem:

- marcadores do painel inicial do projeto;
- lista consolidada de miRNAs encontrados em serum/soro;
- classificacao em alta, media ou exploratoria por recorrencia bibliografica.

Regra de interpretacao da classificacao:

```text
alta recorrencia: miRNAs encontrados em 3 ou mais fontes
media recorrencia: miRNAs encontrados em 2 fontes
exploratoria: miRNAs encontrados em 1 fonte
```

Essa classificacao nao representa diagnostico definitivo, validacao clinica, maior tamanho amostral ou melhor desempenho clinico. Ela serve apenas para organizar a lista inicial do projeto e priorizar a analise computacional.

Alta recorrencia bibliografica:

```text
miR-10b
miR-125b
miR-145
miR-155
miR-195
miR-21
```

Media recorrencia bibliografica:

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

O CSV usa colunas adicionais para documentar a revisao:

```text
numero_fontes
recorrencia_bibliografica
prioridade_projeto
urls
```

O script `scripts/discover_mirna_sequence_candidates.js` carrega esse CSV automaticamente. Assim, novas evidencias de literatura devem ser adicionadas ao CSV, nao diretamente no codigo.

Execucao validada apos essa alteracao:

```text
Biomarcadores positivos solicitados: 43
Biomarcadores positivos com sequencia encontrada: 43
Candidatos humanos avaliados: 221
```

Top 5 candidatos apos incorporar a lista consolidada:

```text
mir-449a       score=0.6500
mir-20b-5p     score=0.6381
let-7i-5p      score=0.6316
let-7c-5p      score=0.6297
mir-526b-3p    score=0.6270
```

O perfil positivo e ponderado por prioridade:

```text
alta = 3
media = 2
painel_inicial = 2
exploratoria = 1
```

Como alguns nomes de literatura nao indicam explicitamente braco `5p` ou `3p`, o CSV usa a coluna `resolved_mature_mirna` para apontar a entrada madura usada no miRBase. Exemplos:

```text
miR-10b  -> hsa-miR-10b-5p
miR-145  -> hsa-miR-145-5p
miR-155  -> hsa-miR-155-5p
miR-195  -> hsa-miR-195-5p
miR-21   -> hsa-miR-21-5p
miR-210  -> hsa-miR-210-3p
miR-24   -> hsa-miR-24-3p
miR-365  -> hsa-miR-365a-3p
miR-520c -> hsa-miR-520c-3p
```

Essas resolucoes devem ser revisadas se uma fonte posterior especificar outro braco maduro.

Fluxo para adicionar novos biomarcadores:

1. Editar:

```text
data/external/breast_cancer_mirna_positive_markers.csv
data/external/breast_cancer_mirna_training_policy.csv
```

2. Adicionar linhas no formato:

```text
mirna,resolved_mature_mirna,direcao,evidencia,fonte,tipo_amostra,numero_fontes,recorrencia_bibliografica,prioridade_projeto,urls,observacao
```

3. Rodar o fluxo principal atual:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
```

4. Conferir as saidas atualizadas:

```text
data/processed/mirna_candidate_discovery_model_ranking.csv
data/processed/mirna_patient_candidate_validation.csv
data/processed/mirna_patient_candidate_integrated_ranking.csv
models/modelo_mirna_candidate_discovery.json
models/modelo_mirna_patient_candidate_validation.json
reports/modelo_mirna_candidate_discovery_report.txt
reports/modelo_mirna_patient_candidate_validation_report.txt
reports/mirna_rankings_dashboard.html
```

Observacao tecnica:

O ranking muda sempre que a lista positiva muda, porque os motifs enriquecidos, o centroide de k-mers e as similaridades passam a ser calculados com o novo conjunto positivo.

Se o usuario trouxer apenas nomes, criar primeiro uma versao simples e depois enriquecer com metadados de fonte, recorrencia e URLs.

Objetivo registrado naquela etapa, posteriormente incorporado ao fluxo de dois modelos:

```text
score_integrado =
  evidencia estavel de expressao nos pacientes
+ similaridade sequencial com marcadores positivos
+ motifs/k-mers em sequencias maduras
+ padroes de precursor/stem-loop
+ evidencia externa/literatura
```

Esse score integrado deve continuar sendo reportado como hipotese computacional e nao como diagnostico ou biomarcador validado.

## Historico: Evidencia Integrada Anterior dos Candidatos

Foi criada uma etapa para combinar tres eixos de evidencia:

```text
sequencia + expressao nos pacientes + recorrencia das referencias positivas
```

Novo script:

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

Logica:

1. Ler o ranking sequencial gerado por `scripts/discover_mirna_sequence_candidates.js`.
2. Para cada candidato, localizar as features de expressao no dataset seguro:

```text
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
```

3. Separar amostras por:

```text
classe = 1 doente
classe = 0 saudavel
```

4. Calcular evidencias de expressao:

- media em doentes e saudaveis;
- mediana em doentes e saudaveis;
- log2 fold-change doente vs saudavel;
- AUC univariada;
- AUC absoluta/direcional;
- Cohen's d em `log1p`;
- percentual de amostras com valor maior que zero.

5. Associar o candidato aos biomarcadores positivos mais proximos por sequencia e usar a recorrencia desses biomarcadores como suporte auxiliar.

Formula:

```text
score_integrado =
  0.45 * score_sequencial
+ 0.45 * score_expressao
+ 0.10 * suporte_recorrencia_referencias
```

O `score_expressao` combina:

- AUC univariada absoluta;
- magnitude de `log2FC`;
- diferenca de presenca maior que zero entre doentes e saudaveis.

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

Interpretacao:

- O ranking sequencial puro responde: quais miRNAs parecem com os biomarcadores positivos por padrao de sequencia?
- O ranking integrado responde: quais desses candidatos tambem apresentam separacao mensuravel entre doentes e saudaveis no CSV atual?

Limite importante:

Como os dados saudaveis e doentes podem vir de fontes/pipelines diferentes, a separacao por expressao pode estar inflada por efeito de lote/fonte. Portanto, o ranking integrado nao deve ser tratado como diagnostico, validacao clinica ou biomarcador confirmado. Ele e apenas uma priorizacao computacional de candidatos para investigacao.

## Atualizacao Operacional: Dois Modelos para Descoberta de Candidatos

> Estado vigente em 09/10/2026. A especificacao metodologica completa e os resultados finais estao em `docs/METODOLOGIA_MODELOS_MIRNA.md`.

### Mudanca de Direcao do Projeto

O foco principal do TCC foi ajustado.

Os modelos antigos:

```text
models/modelo_mirna_logistic.json
models/modelo_mirna_painel.json
```

continuam existindo como historico, comparacao e apoio exploratorio, mas nao sao mais o fluxo principal. Eles classificam amostras/pacientes como saudavel ou doente. O objetivo principal agora nao e classificar pacientes, e sim descobrir e priorizar novos miRNAs candidatos.

Nova pergunta principal:

```text
Quais miRNAs ainda nao usados como positivos no projeto compartilham padroes maduros, seeds e padroes de precursor/hairpin com miRNAs associados ao cancer de mama e, entre eles, quais tambem mostram evidencia computacional nos pacientes do dataset?
```

Ponto cientifico importante:

Nao foi criado um classificador supervisionado "cancerigeno vs nao cancerigeno", porque isso exigiria negativos biologicos confiaveis. Ausencia de evidencia na literatura nao prova que um miRNA e nao cancerigeno. Por isso o projeto usa uma abordagem de candidatos hipoteticos.

### Modelo 1: Descoberta por Padroes Maduros e Hairpin

Scripts:

```text
scripts/generate_mirna_secondary_structure_features.js
scripts/train_mirna_candidate_discovery_model.js
```

Comando:

```powershell
node scripts\generate_mirna_secondary_structure_features.js
node scripts\train_mirna_candidate_discovery_model.js
```

Entradas:

```text
data/external/breast_cancer_mirna_positive_markers.csv
data/external/breast_cancer_mirna_training_policy.csv
data/external/mirbase_mature.fa
data/external/mirbase_hairpin.fa
data/processed/mirna_hairpin_structure_features.csv
data/processed/dataset_mirna_balanceado_colunas_comuns.csv
```

Saidas:

```text
models/modelo_mirna_candidate_discovery.json
data/processed/mirna_candidate_discovery_model_ranking.csv
reports/modelo_mirna_candidate_discovery_report.txt
```

Tipo:

```text
bagged_positive_unlabeled_mature_hairpin_structure_model
```

Esse e agora o modelo principal de descoberta sequencial.

Funcionamento:

1. Carrega os 43 miRNAs positivos associados ao cancer de mama.
2. Cruza cada positivo com a politica explicita de treinamento.
3. Aplica pesos por nivel: alta=3, media/painel inicial=2 e exploratoria=1.
4. Busca suas sequencias maduras no `mirbase_mature.fa` e seus precursores no `mirbase_hairpin.fa`.
5. Extrai k-mers; a grade aninhada testa faixas entre:

```text
k = 2 ate 7
```

6. Usa seed, composicao madura e features estruturais do hairpin.
7. Testa combinacoes de pesos para madura/seed, hairpin e estrutura.
8. Agrega pela media os hairpins e estruturas de loci precursores equivalentes.
9. Usa os demais miRNAs humanos maduros do miRBase como background nao rotulado.
10. Balanceia positivos por familia de seed e treina um ensemble PU por bagging; entradas nao rotuladas sao apenas contrastes temporarios e cada candidato e ranqueado somente por modelos out-of-bag em que nao serviu de contraste.
11. Ranqueia candidatos pela saida aprendida do modelo.
12. Marca quais candidatos tem expressao disponivel no dataset para validacao posterior.

Importante:

O background nao e tratado como "nao cancerigeno". Ele e apenas referencia para o modelo aprender quais k-mers sao mais caracteristicos dos positivos conhecidos.

Politica de curadoria:

```text
breast_cancer_mirna_positive_markers.csv = inventario bibliografico e biologico
breast_cancer_mirna_training_policy.csv = decisao computacional de inclusao e peso
```

Os 43 marcadores entram no treinamento atual. O arquivo de politica permite retirar um marcador ou alterar seu peso sem modificar o registro original das fontes. MiR-16-5p e miR-19a-3p recebem peso 2 porque tambem pertencem ao painel inicial.

Validacao aninhada do Modelo 1:

```text
5 folds externos por familia de seed
3 folds internos para selecao de configuracao
background nao rotulado completo na avaliacao
```

Todos os positivos que compartilham a mesma seed ficam no mesmo fold. As familias externas nao participam do treino nem da escolha de hiperparametros. Sao calculados Recall@1/5/10/20%, IC bootstrap por familia, teste nulo de ranking e baselines de seed, centroide maduro, centroide hairpin e ranking aleatorio.

Na execucao atual, `RNAfold` nao estava disponivel. O arquivo estrutural usa `nussinov_weighted_pairing_proxy`, sem energia livre minima termodinamica. Se ViennaRNA/RNAfold for instalado, e necessario regenerar as features e reexecutar os dois modelos.

Execucao validada:

```text
Marcadores positivos: 43
Familias de seed: 32
Candidatos ranqueados no universo miRBase: 2613
Candidatos com hairpin associado: 2612
Candidatos sem hairpin: 1 (mir-517-5p)
Candidatos com expressao disponivel para validacao em pacientes: 611
Configuracao final: k234_mature70_hairpin20_structure10
Vocabulario final: 650 features
Percentil medio externo por familia: 0.6035 (IC95% 0.5179 a 0.6880; p nulo=0.0120)
Recall@1%: 0/32 (0.00%)
Recall@5%: 0/32 (0.00%)
Recall@10%: 3/32 (9.38%; IC95% 0.00% a 21.88%; p nulo=0.4723)
Recall@20%: 10/32 (31.25%)
```

Top 5 por padrao de sequencia/estrutura aprendido:

```text
mir-1277-5p
mir-2054
mir-1277-3p
mir-590-3p
mir-548aj-3p
```

Interpretacao do `score_modelo_sequencial`:

```text
percentil do candidato pelo logit consenso do ensemble PU
```

Valores proximos de 1 significam maior suporte relativo pelo padrao de sequencia/estrutura aprendido. A probabilidade PU bruta nao e probabilidade de cancer.

Candidatos sem expressao disponivel continuam no ranking global, mas nao entram no Modelo 2 no dataset atual. O unico candidato sem precursor associado, `mir-517-5p`, e avaliado apenas pelas features maduras disponiveis.

Interpretacao estatistica: o percentil medio esta acima do nulo, mas o Recall@10% nao e significativo. O centroide hairpin simples obteve percentil medio 0.6686 e Recall@10% 9.38%; portanto, a versao combinada nao demonstrou superioridade geral e esse resultado deve ser relatado sem inflacao.

O mapeamento de nomes remove apenas sufixos que representam locus (`-1`, `-2` etc.) quando o nome realmente possui uma familia antes desse sufixo. Assim, nomes validos como `hsa-mir-574` nao sao truncados para `hsa-mir`; bracos com locus explicito, como `mir-16-1-3p`, tambem sao associados a familia precursora correta. Os caminhos gravados nos modelos e relatorios sao relativos a raiz do projeto, permitindo reproduzir a execucao em outra maquina.

### Modelo 2: Validacao Computacional em Pacientes

Novo script:

```text
scripts/validate_mirna_candidates_in_patients_model.js
```

Comando:

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

Tipo:

```text
patient_candidate_validation_models_per_candidate
```

Esse e o segundo modelo do fluxo principal. Ele recebe os candidatos do Modelo 1 e faz uma validacao computacional nos pacientes.

Funcionamento:

1. Le os candidatos ranqueados pelo Modelo 1.
2. Localiza as features de expressao associadas a cada candidato no dataset.
3. Para cada candidato, calcula a expressao media das features associadas.
4. Aplica `log1p(expressao)`.
5. Executa regressao logistica univariada por candidato com otimizacao Newton-Raphson e regularizacao L2.
6. Usa validacao cruzada estratificada deterministica de 5 folds, ordenando cada classe por hash estavel de `sample_id` antes da distribuicao.
7. Gera uma predicao out-of-fold para cada amostra, sempre usando um modelo que nao viu aquela amostra no treino.
8. Agrega todas as predicoes out-of-fold para calcular as metricas do candidato.
9. Ajusta um modelo final em todas as amostras apenas para serializacao.
10. Mede se aquele candidato, sozinho, ajuda a separar:

```text
classe=1 doente
classe=0 saudavel
```

Metricas calculadas:

```text
accuracy
precision
recall/sensibilidade
specificity
F1
AUC
matriz de confusao
log2 fold-change
percentual de doentes com expressao > 0
percentual de saudaveis com expressao > 0
```

Nos CSVs atuais, as metricas de validacao cruzada usam o prefixo `cv_oof_`, por exemplo `cv_oof_auc` e `cv_oof_accuracy`. O corte unico 80/20 da versao anterior nao e mais usado pelo Modelo 2 principal.

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

Rankings gerados:

```text
data/processed/mirna_patient_candidate_validation.csv
ranking puro do Modelo 2, ordenado por score_validacao_pacientes

data/processed/mirna_patient_candidate_integrated_ranking.csv
ranking integrado, ordenado por score_final_descoberta
```

Observacao cientifica importante:

```text
O dataset de expressao usa varias colunas em nivel de precursor/familia, como hsa-mir-106b.
O ranking sequencial trabalha com miRNAs maduros, como mir-106b-5p e mir-106b-3p.
Quando dois candidatos maduros compartilham a mesma feature de expressao, o Modelo 2 atribui as mesmas metricas de validacao a ambos.
Nesses casos, a validacao em pacientes confirma associacao da feature disponivel no dataset, mas nao distingue experimentalmente o braco maduro 5p vs 3p.
```

Execucao validada:

```text
Candidatos validados: 611
Candidatos recebidos do ranking sequencial global: 2613
Candidatos ignorados por falta de expressao no dataset: 2002
```

Top 5 por validacao em pacientes:

```text
mir-182-5p   validacao=1.0000  rank_integrado=11
mir-182-3p   validacao=1.0000  rank_integrado=54
let-7f-5p    validacao=1.0000  rank_integrado=2
let-7f-2-3p  validacao=1.0000  rank_integrado=18
let-7f-1-3p  validacao=1.0000  rank_integrado=23
```

Top 5 por score integrado:

```text
mir-32-3p    score_final=0.9975
let-7f-5p    score_final=0.9818
mir-32-5p    score_final=0.9799
mir-95-5p    score_final=0.9312
mir-26a-2-3p score_final=0.9190
```

Interpretacao:

```text
Modelo 1 desta versao historica = priorizava candidatos por um ensemble PU de sequencia madura, seed, hairpin e estrutura no universo humano do miRBase. O fluxo vigente, descrito ao final deste documento, removeu hairpin e estrutura.
Modelo 2 = testa com predicoes out-of-fold, entre esses candidatos, quais aparecem e tem associacao com pacientes doentes no dataset atual.
```

O Modelo 2 funciona como uma "prova" computacional, nao laboratorial. Se um candidato aparece nos pacientes doentes e sua expressao separa doentes de saudaveis, ele ganha prioridade como hipotese. Isso nao prova causalidade, nao confirma biomarcador e nao substitui validacao externa/laboratorial.

A validacao cruzada reduz o otimismo causado por uma unica divisao treino/teste, mas o ranking ainda e escolhido no mesmo dataset. Ela tambem nao corrige o confundimento entre classe e origem/lote. Sem metadados de lote e uma coorte comparavel, esse limite nao pode ser corrigido de forma estatisticamente valida apenas por codigo.

### Novo Fluxo Principal

Quando a tarefa for continuar a descoberta de candidatos, usar:

```powershell
node scripts\generate_mirna_secondary_structure_features.js
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
node scripts\audit_mirna_discovery_pipeline.js
```

Arquivos principais para consulta:

```text
reports/modelo_mirna_candidate_discovery_report.txt
reports/modelo_mirna_patient_candidate_validation_report.txt
data/processed/mirna_patient_candidate_validation.csv
data/processed/mirna_patient_candidate_integrated_ranking.csv
models/modelo_mirna_candidate_discovery.json
models/modelo_mirna_patient_candidate_validation.json
```

### Dashboard HTML dos Rankings

Foi criado um script para gerar uma visualizacao HTML dos rankings, evitando depender da abertura manual dos CSVs.

Script:

```text
scripts/generate_mirna_rankings_html.js
```

Comando:

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

Conteudo do dashboard:

```text
cards com metricas gerais dos modelos
metricas do Modelo 2 calculadas com predicoes out-of-fold de 5 folds
grafico score_modelo_sequencial vs score_validacao_pacientes
grafico top 20 do ranking integrado
aba do ranking integrado
aba do ranking puro de validacao em pacientes
aba do ranking PU/estrutura do Modelo 1
busca textual
paginacao
ordenacao por coluna
```

Observacao operacional:

```text
Os graficos usam Plotly via CDN. Se o HTML for aberto sem internet, as tabelas continuam funcionando e os graficos podem ficar indisponiveis.
```

### Guia Didatico para Apresentacao

O material de apoio completo para explicar os termos biologicos, a transformacao em k-mers, o ensemble PU, a pontuacao out-of-bag, o Modelo 2 e todas as metricas esta em:

```text
docs/GUIA_DIDATICO_PIPELINE_MIRNA.pdf
docs/GUIA_DIDATICO_PIPELINE_MIRNA.html
```

O HTML e gerado por:

```powershell
node scripts\generate_mirna_didactic_guide.js
```

O PDF atual foi impresso localmente em A4 a partir do HTML e deve ser atualizado junto com os resultados do pipeline.

### Recomendacao Atual

Para o TCC, descrever o pipeline principal assim:

```text
Foi desenvolvido um fluxo em dois modelos. O primeiro e um ensemble Positive-Unlabeled por bagging que aprende apenas padroes da sequencia madura: k-mers globais e posicionais, seed, composicao e motivos terminais. Os pesos de evidencia sao balanceados por familia. A avaliacao usa validacao aninhada por familia de seed, background completo, baselines, bootstrap e teste nulo. O segundo modelo recebe os candidatos com expressao disponivel e realiza validacao cruzada estratificada de 5 folds, usando predicoes out-of-fold para testar associacao com amostras doentes em relacao a saudaveis. Os dois modelos priorizam hipoteses e nao confirmam biomarcadores.
```

Evitar dizer:

```text
o modelo descobre miRNAs cancerigenos
```

Preferir:

```text
o modelo prioriza miRNAs candidatos hipoteticamente associados ao cancer de mama
```

## Atualizacao Vigente: Modelo 1 Somente com Sequencia Madura

> Atualizado em 10/10/2026. Esta secao substitui, para o fluxo ativo, as descricoes anteriores que mencionam hairpin, estrutura secundaria, Nussinov ou RNAfold.

Por decisao de escopo do TCC, o Modelo 1 foi simplificado para se concentrar nos miRNAs maduros. O precursor hairpin e as features de estrutura secundaria nao participam mais do treinamento, da selecao de hiperparametros, do ranking nem das explicacoes de features.

Representacao ativa do Modelo 1:

```text
k-mers normalizados da sequencia madura
seed nas posicoes 2 a 8
comprimento normalizado
fracao GC
```

O desenho estatistico foi preservado: 43 positivos curados, balanceamento por familia e peso de evidencia, ensemble Positive-Unlabeled com bagging, pontuacao out-of-bag e validacao aninhada com 5 folds externos e 3 internos por familia de seed.

Resultado apos a simplificacao:

```text
Tipo: bagged_positive_unlabeled_mature_sequence_model
Candidatos: 2613
Candidatos enviados ao Modelo 2: 611
Configuracao final: k234_mature_seed_l2_003_u050
Vocabulario: 304 features
Percentil medio por familia: 0.6055
IC95%: 0.5187 a 0.6902
p do nulo para percentil medio: 0.0111
Recall@10%: 3/32 (9.38%)
p do nulo para Recall@10%: 0.4723
```

Na versao imediatamente anterior, com hairpin e estrutura, o percentil medio era 0.6035 e o Recall@10% era 9.38%. A versao madura passou a 0.6055 e manteve o mesmo Recall@10%. A diferenca de +0.0020 no percentil e pequena e nao deve ser anunciada como ganho estatistico; a conclusao defensavel e que a simplificacao nao piorou a metrica principal observada e deixa o metodo mais alinhado ao objetivo do trabalho.

Top 5 atual do Modelo 1:

```text
mir-1277-5p
mir-2054
mir-1277-3p
mir-590-3p
mir-548f-3p
```

Top 5 atual do ranking integrado:

```text
mir-32-3p
let-7f-5p
mir-32-5p
mir-95-5p
mir-200b-3p
```

Fluxo vigente:

```powershell
node scripts\train_mirna_candidate_discovery_model.js
node scripts\validate_mirna_candidates_in_patients_model.js
node scripts\generate_mirna_rankings_html.js
node scripts\audit_mirna_discovery_pipeline.js
```

O FASTA de hairpins, o CSV estrutural derivado e o gerador Nussinov/RNAfold foram removidos do estado vigente. Permanecem recuperaveis pelo historico do Git, mas nao sao dependencias do pipeline acima.

## Atualizacao: Features Maduras Avancadas e Preparacao da Coorte Externa

> Atualizado em 10/10/2026, depois do baseline madura-only `c0b5527` ter sido enviado ao GitHub.

O Modelo 1 passou a comparar oito configuracoes exclusivamente maduras. Alem do core de k-mers, seed, comprimento e GC, foram avaliadas composicao A/U/C/G, entropia, k-mers posicionais e motivos das extremidades 5p/3p. A selecao continua aninhada por familia; nenhum bloco foi escolhido olhando diretamente o resultado externo.

Resultado vigente:

```text
Configuracao final: k234_positional_mature_l2_003_u050
Vocabulario final: 783 features
Ensemble final: 20 bags x 800 nao rotulados
Modelos OOB por candidato: 6 a 19
Percentil medio por familia: 0.6460
IC95%: 0.5585 a 0.7285
p do nulo: 0.0008
Recall@10%: 4/32 (12.50%)
p do nulo do Recall@10%: 0.2417
Recall@20%: 13/32 (40.63%)
```

A ablação pareada, com os mesmos folds, bags e hiperparametros, encontrou:

```text
core         0.6063  Recall@10=9.38%
composition  0.5579  Recall@10=6.25%
positional   0.6100  Recall@10=6.25%
terminals    0.6829  Recall@10=28.13%
full         0.6408  Recall@10=18.75%
```

Motivos terminais tiveram delta de +0.0766 contra o core, IC95% 0.0123 a 0.1496, p pareado nominal de 0.0369 e FDR BH de 0.0738. O resultado e promissor e exploratorio, mas nao permanece significativo a 5% depois da correcao das quatro comparacoes; nao substitui uma nova avaliacao ou mais positivos.

O ranking do Modelo 1 passou a registrar mediana, quartis, IQR e frequencias de top 1/5/10/20% entre os 20 bags out-of-bag.

O Modelo 2 agora inclui IC aproximado de AUC, p unilateral para AUC > 0,5, FDR Benjamini-Hochberg por hipotese de expressao unica, Cliff's delta, Hedges g, intervalo da diferenca media log1p, alerta de ambiguidade 5p/3p, cenarios de integracao 75/25 e 25/75 e fronteira de Pareto. Foram avaliadas 325 hipoteses unicas; 278 ficaram com FDR < 0,05 e correspondem a 531 candidatos. Esses calculos continuam internos, e a quantidade excepcionalmente alta reforca a suspeita de lote/fonte.

Foi criado o validador externo:

```text
scripts/validate_mirna_external_cohort.js
docs/FORMATO_COORTE_EXTERNA.md
```

Ele exige `sample_id` e `classe`, rejeita IDs presentes na base interna e valores de expressao invalidos, prefere correspondencia madura exata, identifica proxy de familia e aplica ranking/direcao congelados sem retreinar. As hipoteses externas distintas recebem FDR Benjamini-Hochberg. O rotulo de sinal reproduzido exige ao menos 10 amostras por classe, direcao concordante, limite inferior aproximado do IC95% da AUC acima de 0,5 e FDR abaixo de 0,05; o piso tecnico nao substitui calculo de poder. Replicacoes maduras exatas e proxies sao contabilizados separadamente. Um teste sintetico de ponta a ponta foi executado e os arquivos sinteticos foram removidos em seguida.

### Validacao externa real GSE73002 (11/10/2026)

Foi recebida a base GSE73002 com uma matriz de 3.966 amostras por 2.540 miRNAs e um mapa separado de rastreabilidade GSM. A auditoria encontrou 1.280 casos de cancer de mama, 2.686 controles sem cancer, nenhuma linha ou ID duplicado, nenhuma celula vazia e correspondencia integral entre matriz e mapa. A matriz esta em escala log2 e contem valores negativos legitimos.

O desfecho principal foi predefinido antes do calculo no documento `docs/PLANO_VALIDACAO_EXTERNA_GSE73002.md`. O estado anterior ao resultado foi registrado no commit `e1910ac` e na tag `pre-resultados-gse73002-v1`. A analise principal usou somente a divisao TS original: 1.206 casos e 1.343 controles, totalizando 2.549 amostras de soro. Os IDs sinteticos foram substituidos pelos acessos GSM e nenhuma amostra sobrepos a base interna TCGA/GTEx.

Cobertura e resultado principal:

- 611 candidatos congelados;
- 579 correspondencias maduras exatas, 23 proxies e 9 ausentes;
- 588 hipoteses externas distintas;
- 255 replicacoes maduras exatas;
- 254 exatas com AUC direcional >= 0,60;
- 27 exatas sem ambiguidade interna de braco;
- top 10: 7/10; top 20: 13/19 encontrados; top 50: 34/47; top 100: 60/96;
- Spearman score integrado vs AUC externa: 0,0852.

Uma auditoria obrigatoria revelou deslocamento global: a media dos 2.540 miRNAs por amostra separa cancer e controle com AUC 0,971 e 95,67% das features tem media maior no cancer. A proveniencia foi conferida contra a matriz oficial `GSE73002_series_matrix.txt.gz`: `PACIENTE_0001 / hsa-let-7a-5p = 4,626` coincide com `GSM1877618 / MIMAT0000062 = 4,626041376`. O deslocamento nao foi criado pela transposicao local.

Foi executada uma sensibilidade pos-resultado, claramente separada, subtraindo a media global de cada amostra. Ela encontrou 271 replicacoes exatas; 211 coincidiram com o resultado principal e 203 mantiveram AUC >= 0,60 nas duas analises. Nos 20 primeiros, 13 sinais permaneceram robustos. A correlacao global do score com AUC centrada foi -0,0055.

Interpretacao vigente: a pesquisa possui uma validacao computacional externa real e um nucleo robusto de candidatos, especialmente no topo. Nao se deve afirmar que 255 ou 271 miRNAs foram confirmados como biomarcadores. A forte componente global, a baixa correlacao de magnitude do ranking inteiro, a ambiguidade interna de braco e o fato de cinco positivos terem origem bibliografica no proprio estudo GSE73002 devem ser declarados. Uma segunda coorte e validacao laboratorial permanecem desejaveis.
