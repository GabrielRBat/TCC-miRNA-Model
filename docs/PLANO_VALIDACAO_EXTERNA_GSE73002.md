# Plano predefinido de validacao externa GSE73002

Data do congelamento operacional: 11/10/2026.

Este documento registra as decisoes tomadas antes do calculo de AUC, diferencas de expressao ou FDR na GSE73002. O objetivo e impedir que o protocolo seja ajustado em funcao dos resultados observados.

## Objetivo primario

Testar se os candidatos e as direcoes de expressao do ranking integrado congelado se reproduzem em amostras independentes de soro de pessoas com cancer de mama e controles sem cancer.

## Elementos congelados

- commit e tag: `fab7197625a1841c56ca54d7fc038f37cb1491c3` / `pre-validacao-externa-v1`;
- Modelo 1 SHA256: `B0FA10AC216CB65FAC3A0FB94D6EDFDA2B80637B70F2E7B25E684DAA2179DA42`;
- Modelo 2 SHA256: `C580909D3B8F61FB408B0D266D4B07A4D090A39E9BF3613875C900A446578F5E`;
- ranking integrado SHA256: `9AE938FF394D845568F582A45505D1209017112FEFB9975B1E61096D565EDB71`;
- ZIP GSE73002 SHA256: `E5E57EA6E1326FA572A4F67F8A6880BBEEFB0E7D89791CB081FD2341830EE851`;
- ranking, hiperparametros, pesos, candidatos e direcoes nao serao recalculados com a coorte externa.

## Coorte principal

A analise primaria usa somente a divisao de teste original:

- `TS_B`: 1.206 amostras de cancer de mama;
- `TS_N`: 1.343 controles sem cancer;
- total: 2.549 amostras de soro;
- plataforma: 3D-Gene Human miRNA Oligo Chip, GPL18941;
- escala: valores log2 normalizados por quantis, sem novo logaritmo.

A divisao `TR` do estudo original nao participa da analise primaria. Ela podera aparecer apenas como analise secundaria explicitamente rotulada.

## Desfechos e criterios predefinidos

Para cada hipotese externa distinta:

1. aplicar a direcao esperada congelada;
2. calcular AUC direcional e IC95% aproximado de Hanley-McNeil;
3. calcular p unilateral para AUC direcional maior que 0,5;
4. aplicar FDR Benjamini-Hochberg entre hipoteses externas distintas;
5. calcular diferenca media na escala log2, IC95%, Cliff's delta e Hedges g;
6. declarar reproducao estatistica quando a direcao concordar, o limite inferior do IC95% da AUC for maior que 0,5 e o FDR for menor que 0,05;
7. destacar separadamente uma faixa de magnitude pratica quando, alem da reproducao estatistica, a AUC direcional for pelo menos 0,60. Esse corte e descritivo e nao representa utilidade clinica comprovada.

Correspondencia madura exata e o desfecho primario. Proxy de familia/precursor e secundario e nunca sera somado silenciosamente ao total maduro exato. Tambem sera separada a ambiguidade de braco herdada do dataset interno.

## Analises do ranking

Serao apresentados:

- cobertura exata, por proxy e ausente;
- reproducao nos top 10, 20, 50 e 100 do ranking congelado;
- correlacao de Spearman descritiva entre score integrado interno e AUC externa direcional;
- resultados completos, incluindo falhas de reproducao, sem selecionar apenas achados positivos.

## Riscos e limitacoes declarados antes do resultado

- cinco dos 43 marcadores positivos do Modelo 1 foram curados a partir do estudo de Shimomura associado a GSE73002 (`miR-1246`, `miR-1307-3p`, `miR-4634`, `miR-6861-5p` e `miR-6875-5p`);
- esses cinco marcadores nao sao candidatos do ranking externo, mas influenciaram indiretamente o perfil sequencial aprendido;
- a base interna combina controles GTEx com um CSV de doentes de IDs UUID; o repositorio nao contem manifesto clinico local que comprove amostra por amostra a procedencia TCGA-BRCA desses UUIDs;
- a coorte externa usa soro e microarray, enquanto material, plataforma e processamento da montagem interna nao sao integralmente comparaveis ou rastreaveis; isso reduz a chance de sobreposicao, mas introduz diferencas de compartimento e tecnologia;
- validacao computacional externa nao equivale a validacao laboratorial ou clinica;
- a elevada amostra pode tornar efeitos pequenos estatisticamente significativos, por isso AUC e tamanhos de efeito devem acompanhar o FDR.

Qualquer analise que exclua os cinco marcadores de Shimomura sera apresentada como sensibilidade secundaria e nao substituira o resultado do modelo congelado.
