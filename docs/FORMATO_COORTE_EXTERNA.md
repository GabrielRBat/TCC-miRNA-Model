# Formato esperado da coorte externa

A coorte externa deve conter pacientes diferentes dos usados na base interna. O objetivo e testar, sem retreinar ou escolher novamente os candidatos, se a direcao de expressao e a separacao entre doentes e saudaveis se reproduzem.

## CSV minimo

```csv
sample_id,classe,hsa-miR-32-3p,hsa-let-7f-5p,hsa-miR-95-5p
PACIENTE_001,1,12.4,8.2,0.7
CONTROLE_001,0,0.5,2.1,5.9
```

- `sample_id`: identificador unico e sem sobreposicao com a coorte atual;
- `classe`: `1` para cancer de mama e `0` para controle saudavel;
- demais colunas: valores numericos de expressao dos miRNAs, sem celulas vazias; valores negativos sao aceitos apenas quando a escala declarada e log2;
- preferencia: nomes maduros exatos com `-5p` ou `-3p`;
- aceito com ressalva: colunas em nivel de precursor/familia, que nao distinguem os bracos maduros.

## Requisitos cientificos desejaveis

- pacientes com cancer de mama confirmado e controles saudaveis;
- mesmo tipo de amostra da pergunta principal, como soro com soro ou plasma com plasma;
- doentes e controles medidos pela mesma tecnologia e no mesmo estudo;
- expressao normalizada de forma comparavel entre todas as amostras;
- metadados de lote, centro, idade, estagio, subtipo e tratamento, quando disponiveis;
- nenhum paciente reutilizado da coorte de desenvolvimento.

O script exige pelo menos duas amostras por classe para calcular as estatisticas, mas somente marca um sinal como reproduzido quando existem ao menos 10 amostras por classe. Esse e apenas um piso tecnico contra conclusoes com grupos minimos, nao um calculo de poder amostral. O tamanho ideal deve ser definido com orientacao estatistica a partir do efeito esperado e do desenho da coorte.

## Execucao

```powershell
node scripts\validate_mirna_external_cohort.js caminho\coorte_externa.csv --scale linear

# Para matriz que ja esta em log2:
node scripts\validate_mirna_external_cohort.js caminho\coorte_externa.csv --scale log2
```

Saidas:

- `data/processed/mirna_external_cohort_validation.csv`;
- `reports/mirna_external_cohort_validation_report.txt`.

O validador confere IDs, classes, formato numerico, cobertura de miRNAs, correspondencia madura ou por familia, direcao do efeito, AUC externa e intervalo de confianca. Tambem aplica teste unilateral para AUC direcional maior que 0,5 e corrige hipoteses externas distintas por FDR Benjamini-Hochberg. Um sinal so e marcado como reproduzido quando ha pelo menos 10 amostras por classe, a direcao concorda, o limite inferior aproximado do IC95% da AUC fica acima de 0,5 e o FDR fica abaixo de 0,05. O IC usa a aproximacao de Hanley-McNeil e estabiliza AUCs exatamente 0 ou 1 com meio par concordante, evitando intervalo artificialmente nulo na fronteira. A replicacao madura exata aparece separada dos proxies de familia. O script nao retreina os modelos na coorte externa.

A escala deve ser informada explicitamente. Em `linear`, valores negativos sao rejeitados e `log1p` e usado nas metricas de efeito. Em `log2`, valores negativos legitimos sao preservados e nenhum novo logaritmo e aplicado. A opcao `--sample-center mean` existe somente com `--scale log2`, para sensibilidade diagnostica, e deve ser claramente identificada como tal; ela nao deve substituir silenciosamente o resultado principal. O validador rejeita a combinacao `--scale linear --sample-center mean`, pois centralizar antes do logaritmo pode produzir valores sem interpretacao e invalidar `log1p`.
