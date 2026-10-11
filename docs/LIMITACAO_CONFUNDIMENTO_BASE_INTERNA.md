# Confundimento entre classe e origem na base interna

## Resposta curta

Na base interna, ser `doente` e vir do CSV de doentes acontecem sempre juntos; ser `saudavel` e vir da matriz GTEx tambem acontecem sempre juntos. Portanto, quando o Modelo 2 encontra uma diferenca de expressao, ele nao consegue determinar quanto dessa diferenca vem da doenca e quanto vem da origem, do processamento ou de outras caracteristicas tecnicas das bases.

Isso se chama **confundimento estrutural entre classe e origem**. Nao e apenas uma possibilidade abstrata: a estrutura dos identificadores confirma a associacao perfeita entre as duas variaveis.

## O que foi observado no repositorio

| Classe interna | Quantidade | Arquivo de origem | Padrao dos IDs |
|---|---:|---|---|
| `0 = saudavel` | 1.339 | matriz de saudaveis | 1.339/1.339 com prefixo `GTEX-` |
| `1 = doente` | 1.339 | `dataset_mirna_raw (doentes).csv` | 1.339/1.339 UUIDs terminados em `.mirbase21.mirnas.quantification` ou `.mirnaseq.mirnas.quantification` |

Nao existe, nessa base interna:

- amostra doente com ID GTEx;
- amostra saudavel proveniente do CSV de doentes;
- grupo cruzado que permita observar a mesma classe nas duas origens;
- metadado de lote compartilhado que permita separar estatisticamente os efeitos;
- manifesto clinico versionado que ligue os UUIDs do CSV de doentes ao paciente, projeto, tecido e lote de origem.

O nome dos arquivos de classe 1 e compativel com saidas de quantificacao de miRNA, mas o nome sozinho nao comprova, amostra por amostra, a procedencia `TCGA-BRCA`. Enquanto um manifesto oficial nao for incorporado ao projeto, a descricao rigorosa e **CSV original de doentes com IDs UUID de quantificacao**, e nao `TCGA-BRCA confirmado`.

## Por que isso confunde o modelo

O efeito que interessa e:

```text
cancer de mama -> alteracao da expressao dos miRNAs
```

Mas a origem dos dados tambem pode alterar os numeros:

```text
origem / tecido / coleta / plataforma / normalizacao -> alteracao dos valores medidos
```

No desenho interno atual, as duas explicacoes andam juntas:

```text
classe 0 -> sempre matriz GTEx
classe 1 -> sempre CSV de doentes
```

Assim, um miRNA pode separar perfeitamente as classes porque responde a cancer, porque as bases foram produzidas de forma diferente, ou por uma mistura dos dois efeitos. Os dados internos, sozinhos, nao permitem decompor essas possibilidades.

Uma analogia simples: imagine um classificador de gatos e cachorros treinado apenas com gatos fotografados dentro de casa e cachorros fotografados ao ar livre. Mesmo acertando imagens de teste separadas aleatoriamente, ele pode ter aprendido `interior versus exterior`, e nao `gato versus cachorro`.

## Por que a validacao cruzada nao resolve

Os cinco folds separam amostras, mas cada fold preserva a mesma regra:

```text
saudavel = GTEx
doente = CSV de doentes
```

O conjunto de teste interno tem a mesma assinatura de origem vista no treino. Por isso, predicoes out-of-fold reduzem o sobreajuste a individuos, mas nao removem o confundimento de desenho. AUC, FDR, acuracia e intervalos de confianca podem continuar muito altos mesmo que parte importante do sinal seja tecnica.

Tambem nao seria cientificamente seguro aplicar uma correcao de lote automatica e considerar o problema resolvido. Como lote/origem e classe coincidem perfeitamente, o algoritmo nao sabe qual parcela remover sem possivelmente remover tambem o sinal biologico de interesse.

## Impacto em cada etapa do projeto

| Etapa | Impacto do confundimento interno |
|---|---|
| Modelo 1 | Nao treina com a classe dos pacientes. Aprende padroes das sequencias maduras dos 43 positivos; portanto, esse confundimento especifico nao determina seu treinamento. |
| Modelo 2 | Impacto direto. Suas metricas medem associacao dentro da base interna misturada e devem ser usadas como triagem, nao como validacao biologica independente. |
| Ranking integrado | A parcela vinda do Modelo 2 herda essa limitacao. O score final nao e probabilidade de cancer. |
| GSE73002 | Ajuda porque testa o ranking congelado em outra coorte, sem retreino, com casos e controles na mesma plataforma. Ainda assim, a coorte apresentou forte deslocamento global e nao constitui validacao clinica. |

## O que pode ser afirmado

Forma correta:

> O Modelo 2 identificou associacoes internas de expressao em uma base na qual classe e origem estao estruturalmente confundidas. Essas associacoes foram usadas para priorizacao, e o ranking congelado foi depois testado na coorte externa GSE73002.

Forma incorreta:

> O Modelo 2 provou que os miRNAs distinguem biologicamente pacientes com cancer de mama de pessoas saudaveis com a AUC interna observada.

O resultado mais defensavel do projeto continua sendo a convergencia de evidencias: Modelo 1 de sequencia madura, triagem interna do Modelo 2 e teste externo congelado. Na GSE73002, 211 sinais foram concordantes entre a analise principal e a sensibilidade centrada; o nucleo maduro mais rigoroso contem 22 candidatos sem ambiguidade interna de braco, dos quais 21 mantiveram AUC direcional de pelo menos 0,60 nas duas analises. Isso prioriza hipoteses; nao confirma biomarcadores clinicos.

## Como resolver em um estudo futuro

A solucao mais forte e obter uma coorte em que casos e controles tenham sido coletados e processados de maneira comparavel:

- cancer de mama e controles sem cancer na mesma coorte;
- mesmo material biologico;
- mesma plataforma e protocolo de laboratorio;
- mesma normalizacao;
- metadados de paciente, tecido, lote e centro;
- preferencialmente mais de um lote contendo tanto casos quanto controles.

Nesse desenho, doenca e origem deixam de ser equivalentes. So entao e possivel estimar melhor o efeito da doenca e avaliar explicitamente efeitos de lote.

## Frase curta para a banca

> Na base interna, todos os controles vieram do GTEx e todos os doentes vieram de outro arquivo de quantificacao. Por isso, doença e origem variam juntas, e o Modelo 2 nao consegue separar completamente sinal biologico de sinal tecnico. Tratamos essa etapa como triagem interna e damos maior peso ao teste externo congelado, mantendo declaradas as limitacoes da GSE73002.
