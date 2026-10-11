param(
  [string]$ZipPath,
  [string]$OutputPath,
  [string]$MapOutputPath,
  [string]$ReportPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not $ZipPath) { $ZipPath = Join-Path $PSScriptRoot '..\base_mirna_mama_GSE73002.zip' }
if (-not $OutputPath) { $OutputPath = Join-Path $PSScriptRoot '..\data\processed\gse73002_external_validation_ts.csv' }
if (-not $MapOutputPath) { $MapOutputPath = Join-Path $PSScriptRoot '..\data\processed\gse73002_external_validation_ts_map.csv' }
if (-not $ReportPath) { $ReportPath = Join-Path $PSScriptRoot '..\reports\gse73002_external_preparation_report.txt' }

function Csv-Cell([string]$Value) {
  if ($Value -match '[,"\r\n]') { return '"' + $Value.Replace('"', '""') + '"' }
  return $Value
}

$resolvedZip = (Resolve-Path -LiteralPath $ZipPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$resolvedMapOutput = [System.IO.Path]::GetFullPath($MapOutputPath)
$resolvedReport = [System.IO.Path]::GetFullPath($ReportPath)

foreach ($directory in @(
  [System.IO.Path]::GetDirectoryName($resolvedOutput),
  [System.IO.Path]::GetDirectoryName($resolvedMapOutput),
  [System.IO.Path]::GetDirectoryName($resolvedReport)
)) {
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedZip)
try {
  $matrixEntry = $zip.GetEntry('base_mirna_mama_GSE73002.csv')
  $mapEntry = $zip.GetEntry('mapa_amostras_GSE73002.csv')
  if (-not $matrixEntry -or -not $mapEntry) {
    throw 'O ZIP deve conter base_mirna_mama_GSE73002.csv e mapa_amostras_GSE73002.csv.'
  }

  $mapReader = [System.IO.StreamReader]::new($mapEntry.Open())
  try { $mapRows = @($mapReader.ReadToEnd() | ConvertFrom-Csv) }
  finally { $mapReader.Dispose() }

  if ($mapRows.Count -ne 3966) { throw "Quantidade inesperada de linhas no mapa: $($mapRows.Count)" }

  $mapBySyntheticId = @{}
  $allGsm = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $cohortCounts = @{}
  foreach ($row in $mapRows) {
    if ([string]::IsNullOrWhiteSpace($row.sample_id) -or [string]::IsNullOrWhiteSpace($row.gsm)) {
      throw 'O mapa possui sample_id ou GSM vazio.'
    }
    if ($mapBySyntheticId.ContainsKey($row.sample_id)) { throw "sample_id duplicado no mapa: $($row.sample_id)" }
    if (-not $allGsm.Add($row.gsm)) { throw "GSM duplicado no mapa: $($row.gsm)" }
    if ($row.classe -notin @('0', '1')) { throw "Classe invalida no mapa: $($row.sample_id)=$($row.classe)" }
    if (($row.classe -eq '1' -and $row.diagnostico_geo -ne 'breast cancer') -or ($row.classe -eq '0' -and $row.diagnostico_geo -ne 'non-cancer')) {
      throw "Diagnostico incompativel com a classe no mapa: $($row.sample_id)"
    }
    if ($row.titulo_geo -notmatch '^(TR|TS)_([BN]):') { throw "Titulo GEO sem grupo reconhecido: $($row.sample_id)=$($row.titulo_geo)" }
    $group = "$($Matches[1])_$($Matches[2])"
    $cohortCounts[$group] = 1 + [int]($cohortCounts[$group])
    $mapBySyntheticId[$row.sample_id] = $row
  }
  $expectedCounts = @{ TR_B = 74; TR_N = 1343; TS_B = 1206; TS_N = 1343 }
  foreach ($group in $expectedCounts.Keys) {
    if ([int]$cohortCounts[$group] -ne $expectedCounts[$group]) { throw "Contagem inesperada no grupo $group`: $($cohortCounts[$group])" }
  }

  $matrixReader = [System.IO.StreamReader]::new($matrixEntry.Open())
  $outputWriter = [System.IO.StreamWriter]::new($resolvedOutput, $false, [System.Text.UTF8Encoding]::new($false))
  $mapWriter = [System.IO.StreamWriter]::new($resolvedMapOutput, $false, [System.Text.UTF8Encoding]::new($false))
  try {
    $header = $matrixReader.ReadLine()
    if (-not $header -or -not $header.StartsWith('sample_id,classe,')) { throw 'Cabecalho inesperado na matriz GSE73002.' }
    $headerCount = $header.Split(',').Length
    $outputWriter.WriteLine($header)
    $mapWriter.WriteLine('sample_id,source_sample_id,classe,coorte_original,titulo_geo,diagnostico_geo')

    $matrixRows = 0
    $selectedRows = 0
    $diseaseCount = 0
    $controlCount = 0
    $missingMap = 0
    $classMismatch = 0
    $seenGsm = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $seenSyntheticId = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    while (($line = $matrixReader.ReadLine()) -ne $null) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      $matrixRows += 1
      $firstComma = $line.IndexOf(',')
      $secondComma = if ($firstComma -ge 0) { $line.IndexOf(',', $firstComma + 1) } else { -1 }
      if ($firstComma -lt 1 -or $secondComma -lt 0) { throw "Linha invalida na matriz: $($matrixRows + 1)" }
      if (($line.Split(',')).Length -ne $headerCount) { throw "Quantidade de colunas invalida na linha $($matrixRows + 1)." }

      $syntheticId = $line.Substring(0, $firstComma)
      if (-not $seenSyntheticId.Add($syntheticId)) { throw "sample_id duplicado na matriz: $syntheticId" }
      $classValue = $line.Substring($firstComma + 1, $secondComma - $firstComma - 1)
      if (-not $mapBySyntheticId.ContainsKey($syntheticId)) { $missingMap += 1; continue }
      $metadata = $mapBySyntheticId[$syntheticId]
      if ($metadata.classe -ne $classValue) { $classMismatch += 1; continue }
      if ($metadata.titulo_geo -notmatch '^TS_[BN]:') { continue }
      if (-not $seenGsm.Add($metadata.gsm)) { throw "GSM duplicado na coorte TS: $($metadata.gsm)" }

      $outputWriter.WriteLine($metadata.gsm + $line.Substring($firstComma))
      $cohort = $metadata.titulo_geo.Substring(0, 2)
      $mapWriter.WriteLine((@(
        (Csv-Cell $metadata.gsm),
        (Csv-Cell $syntheticId),
        $classValue,
        $cohort,
        (Csv-Cell $metadata.titulo_geo),
        (Csv-Cell $metadata.diagnostico_geo)
      ) -join ','))
      $selectedRows += 1
      if ($classValue -eq '1') { $diseaseCount += 1 } else { $controlCount += 1 }
    }
  }
  finally {
    $matrixReader.Dispose()
    $outputWriter.Dispose()
    $mapWriter.Dispose()
  }
}
finally { $zip.Dispose() }

if ($missingMap -ne 0 -or $classMismatch -ne 0) { throw "Falha de integridade: sem mapa=$missingMap; classe divergente=$classMismatch" }
if ($seenSyntheticId.Count -ne $mapBySyntheticId.Count) { throw "Mapa e matriz nao cobrem o mesmo conjunto de amostras: matriz=$($seenSyntheticId.Count); mapa=$($mapBySyntheticId.Count)" }
if ($matrixRows -ne 3966 -or $selectedRows -ne 2549 -or $diseaseCount -ne 1206 -or $controlCount -ne 1343) {
  throw "Contagens inesperadas: matriz=$matrixRows; TS=$selectedRows; cancer=$diseaseCount; controle=$controlCount"
}

$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedZip).Hash
$outputHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOutput).Hash
$report = @(
  'Preparacao da coorte externa GSE73002',
  '',
  "ZIP de origem (nome do arquivo): $([System.IO.Path]::GetFileName($resolvedZip))",
  "SHA256 do ZIP: $zipHash",
  'Entrada da matriz: base_mirna_mama_GSE73002.csv',
  'Entrada do mapa: mapa_amostras_GSE73002.csv',
  'Regra predefinida: somente amostras TS_B e TS_N do teste original',
  'Escala: log2 normalizada por quantis conforme metadados GEO',
  'Transformacao adicional: nenhuma',
  "Linhas na matriz completa: $matrixRows",
  "Linhas unicas no mapa: $($mapBySyntheticId.Count)",
  "GSMs unicos no mapa: $($allGsm.Count)",
  "Grupos no mapa: TR_B=$($cohortCounts['TR_B']); TR_N=$($cohortCounts['TR_N']); TS_B=$($cohortCounts['TS_B']); TS_N=$($cohortCounts['TS_N'])",
  "Amostras TS selecionadas: $selectedRows",
  "Cancer de mama (classe 1): $diseaseCount",
  "Controles sem cancer (classe 0): $controlCount",
  "Colunas totais: $headerCount",
  "Colunas de miRNA: $($headerCount - 2)",
  'IDs de saida: acessoes GSM originais',
  "SHA256 do CSV preparado: $outputHash",
  '',
  'A coorte TR nao foi usada para escolher candidatos, direcoes ou limiares da validacao principal.'
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText($resolvedReport, $report + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Output $report
