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
