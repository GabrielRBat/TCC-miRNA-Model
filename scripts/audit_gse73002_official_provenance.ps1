param(
  [Parameter(Mandatory = $true)]
  [string]$OfficialMatrixGz,
  [string]$ZipPath,
  [string]$FastaPath,
  [string]$ReportPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not $ZipPath) { $ZipPath = Join-Path $PSScriptRoot '..\base_mirna_mama_GSE73002.zip' }
if (-not $FastaPath) { $FastaPath = Join-Path $PSScriptRoot '..\data\external\mirbase_mature.fa' }
if (-not $ReportPath) { $ReportPath = Join-Path $PSScriptRoot '..\reports\gse73002_provenance_check.txt' }

function Split-TabQuoted([string]$Line) {
  return @($Line.Split("`t") | ForEach-Object { $_.Trim('"') })
}

$resolvedOfficial = (Resolve-Path -LiteralPath $OfficialMatrixGz).Path
$resolvedZip = (Resolve-Path -LiteralPath $ZipPath).Path
$resolvedFasta = (Resolve-Path -LiteralPath $FastaPath).Path
$resolvedReport = [System.IO.Path]::GetFullPath($ReportPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedReport)) | Out-Null

$officialHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOfficial).Hash
$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedZip).Hash
$samplePositions = @(0, 1, 73, 74, 1205, 1206, 1279, 1280, 2548, 2549, 3964, 3965)
$featurePositions = @(2, 3, 10, 100, 250, 500, 750, 1000, 1250, 1750, 2250, 2541)

$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedZip)
try {
  $mapEntry = $zip.GetEntry('mapa_amostras_GSE73002.csv')
  $matrixEntry = $zip.GetEntry('base_mirna_mama_GSE73002.csv')
  if (-not $mapEntry -or -not $matrixEntry) { throw 'Entradas esperadas nao foram encontradas no ZIP.' }

  $mapReader = [System.IO.StreamReader]::new($mapEntry.Open())
  try { $mapRows = @($mapReader.ReadToEnd() | ConvertFrom-Csv) }
  finally { $mapReader.Dispose() }
  if ($mapRows.Count -ne 3966) { throw "Mapa local possui $($mapRows.Count) linhas; esperado: 3966." }
  $mapBySynthetic = @{}
  $mapByGsm = @{}
  foreach ($row in $mapRows) {
    if ($mapBySynthetic.ContainsKey($row.sample_id) -or $mapByGsm.ContainsKey($row.gsm)) { throw 'Mapa local possui identificador duplicado.' }
    $mapBySynthetic[$row.sample_id] = $row
    $mapByGsm[$row.gsm] = $row
  }

  $matrixReader = [System.IO.StreamReader]::new($matrixEntry.Open())
  try {
    $matrixHeader = $matrixReader.ReadLine().Split(',')
    if ($matrixHeader.Count -ne 2542) { throw "Matriz local possui $($matrixHeader.Count) colunas; esperado: 2542." }
    $selectedFeatureNames = @($featurePositions | ForEach-Object { $matrixHeader[$_] })
    $selectedSamples = @()
    $matrixRowIndex = 0
    while (($line = $matrixReader.ReadLine()) -ne $null) {
      if ($samplePositions -contains $matrixRowIndex) {
        $cells = $line.Split(',')
        if ($cells.Count -ne $matrixHeader.Count) { throw "Linha local $($matrixRowIndex + 2) possui quantidade invalida de colunas." }
        $syntheticId = $cells[0]
        if (-not $mapBySynthetic.ContainsKey($syntheticId)) { throw "Amostra local sem mapa: $syntheticId" }
        $values = @{}
        foreach ($featurePosition in $featurePositions) { $values[$matrixHeader[$featurePosition]] = [double]::Parse($cells[$featurePosition], [Globalization.CultureInfo]::InvariantCulture) }
        $selectedSamples += [pscustomobject]@{ syntheticId = $syntheticId; gsm = $mapBySynthetic[$syntheticId].gsm; values = $values }
      }
      $matrixRowIndex += 1
    }
    if ($matrixRowIndex -ne 3966 -or $selectedSamples.Count -ne $samplePositions.Count) { throw 'A selecao deterministica de amostras locais falhou.' }
  }
  finally { $matrixReader.Dispose() }
}
finally { $zip.Dispose() }

$accessionByMirna = @{}
$fastaReader = [System.IO.StreamReader]::new($resolvedFasta)
try {
  while (($line = $fastaReader.ReadLine()) -ne $null) {
    if ($line -match '^>(hsa-\S+)\s+(MIMAT\d+)') { $accessionByMirna[$Matches[1]] = $Matches[2] }
  }
}
finally { $fastaReader.Dispose() }

$selectedAccessions = @{}
foreach ($featureName in $selectedFeatureNames) {
  if (-not $accessionByMirna.ContainsKey($featureName)) { throw "miRNA local sem acesso MIMAT no FASTA: $featureName" }
  $selectedAccessions[$featureName] = $accessionByMirna[$featureName]
}

$officialFile = [System.IO.File]::OpenRead($resolvedOfficial)
$gzip = [System.IO.Compression.GZipStream]::new($officialFile, [System.IO.Compression.CompressionMode]::Decompress)
$officialReader = [System.IO.StreamReader]::new($gzip)
try {
  $officialTitles = $null
  $officialGsms = $null
  $officialDiagnoses = $null
  $officialTissues = $null
  while (-not $officialReader.EndOfStream) {
    $line = $officialReader.ReadLine()
    if ($line.StartsWith('!Sample_title')) { $officialTitles = @(Split-TabQuoted $line | Select-Object -Skip 1) }
    elseif ($line.StartsWith('!Sample_geo_accession')) { $officialGsms = @(Split-TabQuoted $line | Select-Object -Skip 1) }
    elseif ($line.StartsWith('!Sample_characteristics_ch1')) {
      $values = @(Split-TabQuoted $line | Select-Object -Skip 1)
      if ($values.Count -and $values[0].StartsWith('diagnosis:')) { $officialDiagnoses = $values }
      elseif ($values.Count -and $values[0].StartsWith('tissue:')) { $officialTissues = $values }
    }
    elseif ($line -eq '!series_matrix_table_begin') { break }
  }
  foreach ($metadata in @($officialTitles, $officialGsms, $officialDiagnoses, $officialTissues)) {
    if ($null -eq $metadata -or $metadata.Count -ne 4113) { throw 'Metadados oficiais incompletos ou com contagem inesperada.' }
  }

  $metadataMatches = 0
  $excludedOfficial = @()
  for ($index = 0; $index -lt $officialGsms.Count; $index += 1) {
    $gsm = $officialGsms[$index]
    $officialDiagnosis = $officialDiagnoses[$index] -replace '^diagnosis:\s*', ''
    $officialTissue = $officialTissues[$index] -replace '^tissue:\s*', ''
    if (-not $mapByGsm.ContainsKey($gsm)) {
      $excludedOfficial += [pscustomobject]@{ gsm = $gsm; title = $officialTitles[$index]; diagnosis = $officialDiagnosis; tissue = $officialTissue }
      continue
    }
    $local = $mapByGsm[$gsm]
    if ($local.titulo_geo -ne $officialTitles[$index] -or $local.diagnostico_geo -ne $officialDiagnosis -or $officialTissue -ne 'serum') {
      throw "Metadado divergente para $gsm"
    }
    $metadataMatches += 1
  }
  if ($metadataMatches -ne 3966 -or $excludedOfficial.Count -ne 147) { throw 'Cobertura inesperada entre o mapa local e os metadados oficiais.' }
  $excludedProstate = @($excludedOfficial | Where-Object { $_.diagnosis -eq 'prostate disease' -and $_.title -match '^TR_PR:' }).Count
  $excludedBenignBreast = @($excludedOfficial | Where-Object { $_.diagnosis -eq 'benign breast disease' -and $_.title -match '^TS_G:' }).Count
  if ($excludedProstate -ne 93 -or $excludedBenignBreast -ne 54) { throw 'As 147 amostras oficiais ausentes nao correspondem aos grupos esperados TR_PR e TS_G.' }

  $tableHeader = Split-TabQuoted $officialReader.ReadLine()
  if ($tableHeader.Count -ne 4114 -or $tableHeader[0] -ne 'ID_REF') { throw 'Cabecalho inesperado na tabela oficial.' }
  $officialColumnByGsm = @{}
  for ($index = 1; $index -lt $tableHeader.Count; $index += 1) { $officialColumnByGsm[$tableHeader[$index]] = $index }
  foreach ($sample in $selectedSamples) {
    if (-not $officialColumnByGsm.ContainsKey($sample.gsm)) { throw "GSM selecionado ausente da tabela oficial: $($sample.gsm)" }
  }

  $neededAccessions = @{}
  foreach ($featureName in $selectedFeatureNames) { $neededAccessions[$selectedAccessions[$featureName]] = $featureName }
  $officialValues = @{}
  $officialFeatureRows = 0
  while (-not $officialReader.EndOfStream) {
    $line = $officialReader.ReadLine()
    if ($line -eq '!series_matrix_table_end') { break }
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $cells = Split-TabQuoted $line
    $officialFeatureRows += 1
    $accession = $cells[0]
    if ($neededAccessions.ContainsKey($accession)) {
      $values = @{}
      foreach ($sample in $selectedSamples) {
        $values[$sample.gsm] = [double]::Parse($cells[$officialColumnByGsm[$sample.gsm]], [Globalization.CultureInfo]::InvariantCulture)
      }
      $officialValues[$accession] = $values
    }
  }
  if ($officialFeatureRows -ne 2540 -or $officialValues.Count -ne $selectedFeatureNames.Count) { throw 'Cobertura inesperada de miRNAs na matriz oficial.' }
}
finally {
  $officialReader.Dispose()
  $gzip.Dispose()
  $officialFile.Dispose()
}

$comparisonCount = 0
$maximumDifference = 0.0
foreach ($sample in $selectedSamples) {
  foreach ($featureName in $selectedFeatureNames) {
    $accession = $selectedAccessions[$featureName]
    $difference = [Math]::Abs([double]$sample.values[$featureName] - [double]$officialValues[$accession][$sample.gsm])
    $maximumDifference = [Math]::Max($maximumDifference, $difference)
    if ($difference -gt 0.000051) { throw "Valor divergente: $($sample.gsm) / $featureName / delta=$difference" }
    $comparisonCount += 1
  }
}

$sampleReportLines = @($selectedSamples | ForEach-Object { "- $($_.syntheticId) -> $($_.gsm)" })
$featureReportLines = @($selectedFeatureNames | ForEach-Object { "- $_ -> $($selectedAccessions[$_])" })
$reportLines = @(
  'Conferencia ampliada de proveniencia da matriz GSE73002',
  '',
  'Fonte oficial: NCBI GEO GSE73002',
  "Arquivo oficial: $([System.IO.Path]::GetFileName($resolvedOfficial))",
  "SHA256 do arquivo oficial: $officialHash",
  "SHA256 do ZIP recebido: $zipHash",
  '',
  'Amostras na matriz oficial: 4113',
  "Amostras presentes no ZIP e conferidas: $metadataMatches/3966",
  "Amostras oficiais nao incluidas no ZIP: $($excludedOfficial.Count) (TR_PR/prostate disease=$excludedProstate; TS_G/benign breast disease=$excludedBenignBreast)",
  'Campos conferidos: GSM, titulo GEO, diagnostico e tecido=serum',
  "Amostras distribuidas selecionadas para conferencia numerica: $($selectedSamples.Count)",
  "miRNAs distribuidos selecionados para conferencia numerica: $($selectedFeatureNames.Count)",
  "Celulas numericas conferidas: $comparisonCount/$comparisonCount",
  "Maior diferenca absoluta: $($maximumDifference.ToString('0.000000000', [Globalization.CultureInfo]::InvariantCulture))",
  'Tolerancia: 0,000051, compativel com arredondamento local a quatro casas decimais',
  '',
  'Amostras conferidas:'
) + $sampleReportLines + @(
  '',
  'miRNAs conferidos:'
) + $featureReportLines + @(
  '',
  'Conclusao: os metadados completos e a amostra numerica distribuida do ZIP coincidem com a matriz processada oficial dentro da tolerancia de arredondamento. O deslocamento global observado nao foi criado pela transposicao local.',
  ''
)
$report = $reportLines -join [Environment]::NewLine
[System.IO.File]::WriteAllText($resolvedReport, $report, [System.Text.UTF8Encoding]::new($false))
Write-Output $report
