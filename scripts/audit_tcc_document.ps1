param(
  [string]$OriginalPath,
  [string]$UpdatedPath,
  [string]$PdfPath,
  [string]$ReportPath
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OriginalPath) { $OriginalPath = Join-Path $root 'TCC_Predicao_Marcadores_Geneticos_Cancer_Mama.docx' }
if (-not $UpdatedPath) { $UpdatedPath = Join-Path $root 'TCC_Predicao_Marcadores_Geneticos_Cancer_Mama_ATUALIZADO.docx' }
if (-not $PdfPath) { $PdfPath = Join-Path $root 'TCC_Predicao_Marcadores_Geneticos_Cancer_Mama_ATUALIZADO.pdf' }
if (-not $ReportPath) { $ReportPath = Join-Path $root 'reports\tcc_document_review_report.txt' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Review, [bool]$Ok, [string]$Description, [string]$Detail = '') {
  $checks.Add([pscustomobject]@{ Review = $Review; Ok = $Ok; Description = $Description; Detail = $Detail })
}

function Read-Docx {
  param([string]$Path)
  $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
  try {
    $entry = $zip.GetEntry('word/document.xml')
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $paragraphs = $xml.SelectNodes('//w:body/w:p', $ns)
    $text = ($paragraphs | ForEach-Object { (($_.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.InnerText }) -join '') }) -join "`n"
    $mediaCount = @($zip.Entries | Where-Object { $_.FullName -match '^(?:word/)?media/.+\.(?:png|jpe?g)$' }).Count
    return [pscustomobject]@{ Text = $text; ParagraphCount = $paragraphs.Count; MediaCount = $mediaCount }
  }
  finally { $zip.Dispose() }
}

$originalResolved = (Resolve-Path -LiteralPath $OriginalPath).Path
$updatedResolved = (Resolve-Path -LiteralPath $UpdatedPath).Path
$pdfResolved = (Resolve-Path -LiteralPath $PdfPath).Path
$updated = Read-Docx $updatedResolved
$lower = $updated.Text.ToLowerInvariant()

$required = @(
  'DESCOBERTA E PRIORIZAÇÃO COMPUTACIONAL DE BIOMARCADORES DE MICRORNA',
  'Positive-Unlabeled',
  '2.613 candidatos',
  '611 candidatos',
  '64,60%',
  'p=0,0008',
  'Recall@10%',
  'GSE73002',
  '1.206 amostras',
  '1.343 controles',
  '255',
  '211 sinais',
  '22 candidatos',
  'deslocamento global',
  'doença mamária benigna',
  'classe e fonte',
  'pós-hoc',
  'não confirmam biomarcadores'
)
foreach ($term in $required) { Add-Check '1-cientifica' ($lower.Contains($term.ToLowerInvariant())) "conteudo vigente presente: $term" }

$stale = @(
  '99,44%',
  '221 miRNAs',
  '0,7947',
  'discover_mirna_sequence_candidates.js',
  'build_integrated_mirna_candidate_evidence.js',
  'mirbase_hairpin.fa',
  'modelo_mirna_painel.json',
  'modelo_mirna_logistic.json',
  'TCGA/GDC Data Portal',
  'TCGA-CESC',
  'Scoreseq = 0,50',
  'Scoreintegrado = 0,45'
)
foreach ($term in $stale) { Add-Check '1-cientifica' (-not $lower.Contains($term.ToLowerInvariant())) "artefato antigo ausente: $term" }

Add-Check '1-cientifica' ($lower.Contains('cinco dos 43 positivos')) 'dependencia bibliografica parcial declarada'
Add-Check '1-cientifica' ($lower.Contains('não prova sozinho independência no nível da pessoa')) 'independencia individual corretamente qualificada'
Add-Check '1-cientifica' ($lower.Contains('não retreina os modelos')) 'avaliacao externa declarada sem retreino'
Add-Check '1-cientifica' ($lower.Contains('não está calibrado para decisão clínica')) 'uso clinico explicitamente negado'
Add-Check '1-cientifica' ($lower.Contains('benjamini; hochberg') -and $lower.Contains('hanley, j. a.; mcneil')) 'referencias estatisticas adicionadas'
Add-Check '1-cientifica' ($lower.Contains('kozomara, a.; birgaoanu, m.; griffiths-jones')) 'referencia do miRBase adicionada'
Add-Check '1-cientifica' ($updated.ParagraphCount -eq 297) 'estrutura possui 297 paragrafos' $updated.ParagraphCount
Add-Check '1-cientifica' ($updated.MediaCount -eq 2) 'documento possui duas figuras incorporadas' $updated.MediaCount

$pdfBytes = [System.IO.File]::ReadAllBytes($pdfResolved)
$pdfStart = [System.Text.Encoding]::ASCII.GetString($pdfBytes, 0, [Math]::Min(5, $pdfBytes.Length))
$pdfTailStart = [Math]::Max(0, $pdfBytes.Length - 1024)
$pdfTail = [System.Text.Encoding]::ASCII.GetString($pdfBytes, $pdfTailStart, $pdfBytes.Length - $pdfTailStart)
Add-Check '2-formatacao' ($pdfStart -eq '%PDF-') 'PDF possui assinatura valida' $pdfStart
Add-Check '2-formatacao' ($pdfTail.Contains('%%EOF')) 'PDF possui marcador de encerramento'
Add-Check '2-formatacao' ((Get-Item -LiteralPath $updatedResolved).Length -gt 400000) 'DOCX atualizado possui tamanho plausivel' (Get-Item -LiteralPath $updatedResolved).Length
Add-Check '2-formatacao' ($pdfBytes.Length -gt 500000) 'PDF atualizado possui tamanho plausivel' $pdfBytes.Length
Add-Check '2-formatacao' ((Get-FileHash -Algorithm SHA256 -LiteralPath $originalResolved).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $updatedResolved).Hash) 'original e atualizado sao arquivos distintos'

$indices = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'update_tcc_document.ps1') -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s+(\d+)\s*=') { [int]$Matches[1] }
} | Sort-Object -Unique
Add-Check '2-formatacao' ($indices.Count -eq 109) 'mapa de atualizacao contem 109 paragrafos' $indices.Count

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$original = $null
$document = $null
try {
  $original = $word.Documents.Open($originalResolved, $false, $true)
  $document = $word.Documents.Open($updatedResolved, $false, $true)
  Add-Check '2-formatacao' ($original.Paragraphs.Count -eq $document.Paragraphs.Count -and $document.Paragraphs.Count -eq 297) 'quantidade de paragrafos preservada' "$($original.Paragraphs.Count)/$($document.Paragraphs.Count)"
  Add-Check '2-formatacao' ($original.Sections.Count -eq $document.Sections.Count -and $document.Sections.Count -eq 2) 'quantidade de secoes preservada' "$($original.Sections.Count)/$($document.Sections.Count)"
  Add-Check '2-formatacao' ($original.InlineShapes.Count -eq 2 -and $document.InlineShapes.Count -eq 2) 'quantidade de figuras preservada'
  Add-Check '2-formatacao' ($document.TablesOfContents.Count -eq 1) 'sumario automatico preservado'
  Add-Check '2-formatacao' ($document.Revisions.Count -eq 0) 'documento sem revisoes pendentes' $document.Revisions.Count

  $styleDifferences = 0
  for ($index = 1; $index -le 297; $index += 1) {
    if ($index -in 263..267) { continue }
    if ([string]$original.Paragraphs.Item($index).Style -ne [string]$document.Paragraphs.Item($index).Style) { $styleDifferences += 1 }
  }
  Add-Check '2-formatacao' ($styleDifferences -eq 0) 'estilos de paragrafo preservados fora das novas referencias' $styleDifferences

  $formatDifferences = 0
  foreach ($index in $indices) {
    if ($index -in @(148, 262, 263, 264, 265, 266, 267)) { continue }
    $oldParagraph = $original.Paragraphs.Item($index)
    $newParagraph = $document.Paragraphs.Item($index)
    $oldRange = $oldParagraph.Range.Duplicate
    $newRange = $newParagraph.Range.Duplicate
    $oldRange.End = [Math]::Min($oldRange.Start + 1, $oldRange.End)
    $newRange.End = [Math]::Min($newRange.Start + 1, $newRange.End)
    $oldFormat = @([string]$oldParagraph.Style, $oldParagraph.Format.Alignment, [Math]::Round($oldParagraph.Format.LeftIndent, 2), [Math]::Round($oldParagraph.Format.FirstLineIndent, 2), [Math]::Round($oldParagraph.Format.SpaceBefore, 2), [Math]::Round($oldParagraph.Format.SpaceAfter, 2), [string]$oldRange.Font.Name, [Math]::Round($oldRange.Font.Size, 2), $oldRange.Font.Bold, $oldRange.Font.Italic) -join '|'
    $newFormat = @([string]$newParagraph.Style, $newParagraph.Format.Alignment, [Math]::Round($newParagraph.Format.LeftIndent, 2), [Math]::Round($newParagraph.Format.FirstLineIndent, 2), [Math]::Round($newParagraph.Format.SpaceBefore, 2), [Math]::Round($newParagraph.Format.SpaceAfter, 2), [string]$newRange.Font.Name, [Math]::Round($newRange.Font.Size, 2), $newRange.Font.Bold, $newRange.Font.Italic) -join '|'
    if ($oldFormat -ne $newFormat) { $formatDifferences += 1 }
  }
  Add-Check '2-formatacao' ($formatDifferences -eq 0) 'tipografia, alinhamentos e recuos dos paragrafos atualizados preservados' $formatDifferences

  $pageSetupEqual = $true
  for ($section = 1; $section -le $document.Sections.Count; $section += 1) {
    $oldSetup = $original.Sections.Item($section).PageSetup
    $newSetup = $document.Sections.Item($section).PageSetup
    $oldValues = @($oldSetup.PageWidth, $oldSetup.PageHeight, $oldSetup.TopMargin, $oldSetup.BottomMargin, $oldSetup.LeftMargin, $oldSetup.RightMargin) -join '|'
    $newValues = @($newSetup.PageWidth, $newSetup.PageHeight, $newSetup.TopMargin, $newSetup.BottomMargin, $newSetup.LeftMargin, $newSetup.RightMargin) -join '|'
    if ($oldValues -ne $newValues) { $pageSetupEqual = $false }
  }
  Add-Check '2-formatacao' $pageSetupEqual 'tamanho de pagina e margens preservados'

  $shapeSizeEqual = $true
  for ($index = 1; $index -le 2; $index += 1) {
    $oldShape = $original.InlineShapes.Item($index)
    $newShape = $document.InlineShapes.Item($index)
    if ([Math]::Abs($oldShape.Width - $newShape.Width) -gt 0.1 -or [Math]::Abs($oldShape.Height - $newShape.Height) -gt 0.1) { $shapeSizeEqual = $false }
  }
  Add-Check '2-formatacao' $shapeSizeEqual 'dimensoes das duas figuras preservadas'

  $pages = $document.ComputeStatistics(2)
  Add-Check '2-formatacao' ($pages -ge 20 -and $pages -le 40) 'paginacao final plausivel' $pages
  $tocText = if ($document.TablesOfContents.Count) { $document.TablesOfContents.Item(1).Range.Text } else { '' }
  Add-Check '2-formatacao' ($tocText.Contains('INTRODUÇÃO') -and $tocText.Contains('REFERÊNCIAS') -and $tocText.Contains('APÊNDICE A')) 'sumario atualizado contem secoes principais'
}
finally {
  if ($null -ne $original) { $original.Close($false) }
  if ($null -ne $document) { $document.Close($false) }
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$failures = @($checks | Where-Object { -not $_.Ok })
$review1 = @($checks | Where-Object { $_.Review -eq '1-cientifica' })
$review2 = @($checks | Where-Object { $_.Review -eq '2-formatacao' })
$lines = @(
  'Revisao dupla da documentacao atualizada do TCC',
  '',
  "Resultado geral: $(if ($failures.Count) { 'FALHOU' } else { 'APROVADO' })",
  "Verificacoes totais: $($checks.Count)",
  "Falhas: $($failures.Count)",
  '',
  "Revisao 1 - consistencia cientifica: $(@($review1 | Where-Object Ok).Count)/$($review1.Count)",
  "Revisao 2 - formatacao e integridade: $(@($review2 | Where-Object Ok).Count)/$($review2.Count)",
  '',
  'Detalhes:'
) + @($checks | ForEach-Object { "$(if ($_.Ok) { 'OK' } else { 'FALHA' })`t$($_.Review)`t$($_.Description)$(if ($_.Detail -ne '') { "`t$($_.Detail)" })" }) + @('')

[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($ReportPath))) | Out-Null
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($ReportPath), ($lines -join [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
Write-Output ($lines -join [Environment]::NewLine)
if ($failures.Count) { exit 1 }
