# Analise de sensibilidade pos-resultado da GSE73002

Esta analise nao fazia parte do desfecho primario. Ela foi motivada depois que a execucao congelada mostrou AUCs quase polarizadas em valores muito altos ou muito baixos conforme a direcao esperada.

O diagnostico mede se existe um deslocamento global de intensidade entre casos e controles usando a media das 2.540 medidas de cada amostra. Se essa media global, sozinha, separar as classes ou se quase todos os miRNAs mudarem na mesma direcao, parte da aparente reproducao pode refletir intensidade global, lote, coleta, armazenamento ou processamento.

A sensibilidade subtrai de cada valor log2 a media dos 2.540 miRNAs da propria amostra. Em seguida, reaplica exatamente o ranking, as direcoes, a AUC, o IC e o FDR congelados. Essa centralizacao:

- nao retreina os modelos;
- nao escolhe candidatos;
- nao altera os rotulos;
- remove apenas um deslocamento aditivo global por amostra;
- pode remover tanto artefato tecnico quanto um eventual sinal biologico global, por isso nao substitui o resultado primario.

O resultado principal sem centralizacao deve continuar sendo mostrado. A analise centrada serve para verificar quais candidatos mantem separacao especifica relativa ao restante do perfil de miRNAs.

## Resultados

Na analise primaria, 255 dos 579 candidatos com correspondencia madura exata atenderam ao criterio estatistico predefinido. Depois da centralizacao por media da amostra, 271 atenderam ao mesmo criterio. A intersecao foi de 211 candidatos, e 203 deles mantiveram AUC direcional de pelo menos 0,60 nas duas analises.

Essa intersecao ainda inclui candidatos cuja direcao interna veio de uma feature compartilhada por bracos 5p/3p. A analise primaria possui 27 replicacoes exatas sem essa ambiguidade e a centrada possui 28. A intersecao mais estrita e composta por 22 candidatos sem ambiguidade interna de braco; 21 deles mantiveram AUC direcional de pelo menos 0,60 nas duas analises.

Os 22 candidatos desse nucleo, na ordem do ranking integrado interno, sao: `mir-106a-3p`, `mir-497-3p`, `mir-34a-3p`, `mir-17-3p`, `mir-200a-5p`, `mir-944`, `mir-429`, `mir-107`, `mir-5687`, `mir-5683`, `mir-184`, `mir-93-3p`, `mir-496`, `mir-449a`, `mir-934`, `mir-125a-3p`, `mir-3174`, `mir-20a-3p`, `mir-1270`, `mir-1269a`, `mir-518b` e `mir-551a`. O ultimo reproduz estatisticamente nas duas analises, mas sua AUC centrada e 0,547; por isso somente 21 satisfazem tambem o filtro descritivo de magnitude.

Entre os 20 primeiros candidatos do ranking integrado interno com correspondencia exata, 13 reproduziram nas duas analises: `mir-32-3p`, `let-7f-5p`, `mir-32-5p`, `mir-200b-3p`, `mir-29b-3p`, `mir-542-3p`, `mir-181b-3p`, `mir-582-5p`, `mir-182-5p`, `mir-141-3p`, `let-7a-3p`, `mir-142-3p` e `mir-106a-3p`.

A correlacao de Spearman entre o score integrado interno e a AUC externa foi baixa tanto na analise primaria (`rho = 0,0852`) quanto na centrada (`rho = -0,0055`). Portanto, a coorte externa sustenta a reproducao de um subconjunto priorizado, especialmente no topo, mas nao demonstra que a ordenacao completa generaliza.

## Interpretacao cientifica

O conjunto de 211 replicacoes concordantes e mais conservador que apresentar isoladamente as 255 ou 271 replicacoes. Para conclusoes especificamente sobre o braco maduro, o conjunto de 22 sem ambiguidade interna e a referencia mais rigorosa. Ambos devem ser descritos como evidencia computacional externa, nao como confirmacao clinica de biomarcadores. A centralizacao foi decidida apos observar o deslocamento global e deve permanecer identificada como analise de sensibilidade pos-hoc.

Esta etapa e uma avaliacao externa do ranking, nao um terceiro modelo. A matriz recebida tambem nao inclui as 54 amostras de doenca mamaria benigna existentes na fonte oficial; portanto, nem a analise primaria nem esta sensibilidade testam especificidade contra essa condicao. As metricas consolidadas e a explicacao completa estao em `reports/metricas_coorte_externa_gse73002.csv` e `docs/EXPLICACAO_COORTE_EXTERNA_GSE73002.md`.
