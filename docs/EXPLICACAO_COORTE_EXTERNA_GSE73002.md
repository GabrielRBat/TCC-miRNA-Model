# Coorte externa de validacao em soro — GEO GSE73002

## Resposta curta

A GSE73002 nao e um terceiro modelo. O pipeline de aprendizado termina no Modelo 2. Depois disso, o ranking final e congelado e levado a uma base externa para verificar se os sinais aparecem novamente sem retreinar, trocar direcoes ou escolher novos candidatos.

```text
Modelo 1 -> Modelo 2 -> ranking final congelado
                                  |
                                  v
              avaliacao externa GSE73002 (sem aprendizado)
```

O nome amigavel usado no projeto e **coorte externa de validacao em soro**. `GSE73002` deve permanecer porque e o identificador oficial da serie no NCBI GEO: <https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE73002>.

## O que foi recebido e o que existe na fonte oficial

A matriz oficial conferida possui 4.113 amostras. O ZIP recebido possui 3.966 amostras de cancer de mama ou controles sem cancer. A auditoria identificou 147 amostras oficiais que nao estao no ZIP: 93 de doenca prostatica do grupo de treino e 54 de doenca benigna da mama do grupo de teste.

Essa diferenca nao altera o contraste principal predefinido, que usa somente `TS_B` e `TS_N`. Entretanto, ela limita a pergunta: esta analise testa cancer de mama contra controles sem cancer; ela **nao testa especificidade contra doenca benigna da mama**.

A proveniencia foi ampliada para todos os 3.966 metadados locais e uma amostra distribuida de 144 celulas numericas. Todas coincidiram com a matriz oficial dentro da tolerancia de arredondamento; a maior diferenca absoluta foi 0.000049071.

## Coorte usada na analise principal

| Grupo | Amostras |
|---|---:|
| Cancer de mama — `TS_B` | 1.206 |
| Controles sem cancer — `TS_N` | 1.343 |
| Total | 2.549 |

Todas sao amostras de soro medidas na plataforma do estudo, com 2.540 miRNAs em valores log2 normalizados por quantis. Nao foi aplicado um segundo logaritmo.

Nao houve coincidencia literal entre os IDs GSM externos e os IDs internos. Como as bases usam sistemas de identificacao diferentes, isso comprova ausencia de IDs repetidos, mas nao e, sozinho, prova documental de independencia no nivel da pessoa. A origem externa distinta e o tipo de amostra tornam sobreposicao improvavel, mas um cruzamento individual exigiria uma chave comum que o repositorio nao possui.

## O que ficou congelado

Antes da avaliacao externa foram congelados:

- os 611 candidatos;
- a ordem do ranking integrado;
- a direcao esperada de expressao;
- os pesos e hiperparametros dos Modelos 1 e 2;
- os criterios estatisticos;
- os hashes dos modelos, ranking e matriz preparada.

A coorte externa nao altera nenhum desses elementos. Ela calcula novas metricas de avaliacao para a lista pronta.

## Cobertura dos candidatos

| Situacao | Quantidade | Uso |
|---|---:|---|
| miRNA maduro exato | 579 | resultado primario |
| proxy de familia/precursor | 23 | evidencia secundaria |
| ausente | 9 | nao avaliado |
| hipoteses externas distintas | 588 | base da correcao FDR |

Proxy nunca e somado silenciosamente ao total de miRNAs maduros exatos.

## Criterio de reproducao

Um sinal e marcado como reproduzido quando:

1. existem pelo menos 10 amostras em cada classe;
2. a direcao observada concorda com a direcao interna congelada;
3. o limite inferior aproximado do IC95% da AUC direcional e maior que 0.5;
4. o FDR Benjamini-Hochberg e menor que 0.05.

AUC direcional de pelo menos 0.6 e apresentada apenas como filtro descritivo de magnitude. Nao e um limiar de uso clinico.

## Resultado principal

| Metrica | Resultado | Leitura correta |
|---|---:|---|
| Replicacoes maduras exatas | 255 | atendem ao criterio estatistico predefinido |
| Exatas com AUC >= 0,60 | 254 | filtro adicional de magnitude |
| Exatas sem ambiguidade interna de braco | 27 | evidencia interna mais especifica para 5p/3p |
| Top 10 reproduzidos | 7/10 | concentracao no topo |
| Top 20 reproduzidos | 13/19 | um candidato estava ausente |
| Spearman score interno x AUC externa | 0.0852 | baixa concordancia da ordenacao completa |

## Controle de deslocamento global

A media global dos 2.540 miRNAs por amostra separou as classes com AUC 0.971. Alem disso, 2.430/2.540 (95.67%) dos miRNAs tiveram media maior no grupo cancer.

Esse padrao mostra uma forte componente global de coorte/processamento. Portanto, as 255 replicacoes principais nao devem ser chamadas de 255 biomarcadores confirmados.

## Sensibilidade centrada pos-hoc

Depois de observar o deslocamento, foi executada uma analise de sensibilidade que subtrai a media dos 2.540 miRNAs de cada amostra. Ela nao retreina os modelos, mas foi decidida apos o resultado e, por isso, permanece rotulada como pos-hoc.

| Convergencia | Quantidade |
|---|---:|
| Replicacoes exatas na analise principal | 255 |
| Replicacoes exatas na sensibilidade centrada | 271 |
| Replicacoes exatas presentes nas duas | 211 |
| Presentes nas duas e AUC >= 0,60 nas duas | 203 |
| Nucleo maduro estrito sem ambiguidade nas duas | 22 |
| Nucleo estrito com AUC >= 0,60 nas duas | 21 |
| Candidatos do top 20 reproduzidos nas duas | 13 |

Os 22 candidatos do nucleo estrito, na ordem do ranking interno, sao: `mir-106a-3p`, `mir-497-3p`, `mir-34a-3p`, `mir-17-3p`, `mir-200a-5p`, `mir-944`, `mir-429`, `mir-107`, `mir-5687`, `mir-5683`, `mir-184`, `mir-93-3p`, `mir-496`, `mir-449a`, `mir-934`, `mir-125a-3p`, `mir-3174`, `mir-20a-3p`, `mir-1270`, `mir-1269a`, `mir-518b`, `mir-551a`.

## Hierarquia correta da evidencia

1. **255**: resultado principal maduro exato, mas exposto ao deslocamento global.
2. **211**: sinais concordantes entre o principal e a sensibilidade centrada.
3. **22**: nucleo mais rigoroso para afirmacoes sobre miRNA maduro, sem ambiguidade interna de braco nas duas analises.
4. **21**: subconjunto estrito que tambem manteve AUC direcional >= 0,60 nas duas analises.

Para a apresentacao, o conjunto de 22 deve ser o destaque conservador. Nenhum desses numeros equivale a confirmacao clinica.

## Limitacoes obrigatorias

- cinco dos 43 positivos do Modelo 1 vieram da publicacao associada a GSE73002; e uma dependencia bibliografica indireta;
- a matriz recebida nao inclui as 54 amostras de doenca benigna da mama do teste oficial;
- ha forte deslocamento global entre as classes;
- a correlacao entre score interno e magnitude externa e baixa;
- a checagem de IDs nao comprova sozinha independencia por pessoa;
- e apenas uma coorte externa;
- nao houve validacao laboratorial ou clinica.

## O que pode ser afirmado

> O ranking congelado produzido pelos dois modelos foi avaliado sem retreinamento em uma coorte externa de soro. A analise encontrou um conjunto de 211 sinais maduros concordantes entre o resultado principal e uma sensibilidade centrada; o nucleo mais rigoroso contem 22 candidatos sem ambiguidade interna de braco.

## O que nao pode ser afirmado

> A GSE73002 treinou um terceiro modelo, confirmou 255 biomarcadores ou demonstrou desempenho clinico do pipeline.

## Arquivos e reproducao

- metricas consolidadas: `reports/metricas_coorte_externa_gse73002.csv`;
- plano predefinido: `docs/PLANO_VALIDACAO_EXTERNA_GSE73002.md`;
- sensibilidade: `docs/ANALISE_SENSIBILIDADE_GSE73002.md`;
- proveniencia oficial: `reports/gse73002_provenance_check.txt`;
- resultados completos: `data/processed/gse73002_ts_external_validation*.csv`;
- resumos: `reports/gse73002_ts_external_validation*_summary.json`.

Geracao deste documento e do CSV consolidado:

```powershell
node scripts\generate_gse73002_cohort_deliverables.js
```
