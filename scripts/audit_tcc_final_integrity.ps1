param(
    [string]$DocumentPath = (Join-Path $PSScriptRoot '..\TCC_Predicao_Marcadores_Geneticos_Cancer_Mama_ATUALIZADO.docx'),
    [string]$PdfPath = (Join-Path $PSScriptRoot '..\TCC_Predicao_Marcadores_Geneticos_Cancer_Mama_ATUALIZADO.pdf'),
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\reports\tcc_document_final_integrity_report.txt')
)

$ErrorActionPreference = 'Stop'
$documentResolved = (Resolve-Path -LiteralPath $DocumentPath).Path
$pdfResolved = (Resolve-Path -LiteralPath $PdfPath).Path
$reportResolved = [System.IO.Path]::GetFullPath($ReportPath)
$checks = New-Object System.Collections.Generic.List[object]
$pageDetails = New-Object System.Collections.Generic.List[string]

function Add-Check {
    param([bool]$Condition, [string]$Description, [string]$Detail = '')
    $checks.Add([pscustomobject]@{
        Passed = $Condition
        Description = $Description
        Detail = $Detail
    })
}

function Normalize-Text {
    param([string]$Text)
    if ($null -eq $Text) { return '' }
    return (($Text -replace '[\r\n\t\f]+', ' ') -replace '\s+', ' ').Trim()
}

$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($documentResolved, $false, $true, $false)
    $document.Repaginate()

    $pageCount = $document.ComputeStatistics(2)
    $fullText = [string]$document.Content.Text

    Add-Check ($pageCount -eq 27) 'paginação do DOCX permanece em 27 páginas' ([string]$pageCount)
    Add-Check ($document.Paragraphs.Count -eq 297) 'estrutura permanece com 297 parágrafos' ([string]$document.Paragraphs.Count)
    Add-Check ($document.Sections.Count -eq 2) 'estrutura permanece com duas seções' ([string]$document.Sections.Count)
    Add-Check ($document.InlineShapes.Count -eq 2) 'duas figuras permanecem incorporadas' ([string]$document.InlineShapes.Count)
    Add-Check ($document.TablesOfContents.Count -eq 1) 'sumário automático permanece incorporado' ([string]$document.TablesOfContents.Count)
    Add-Check ($document.Revisions.Count -eq 0) 'não existem revisões pendentes' ([string]$document.Revisions.Count)
    Add-Check ($document.Comments.Count -eq 0) 'não existem comentários acidentais' ([string]$document.Comments.Count)
    Add-Check (-not $document.ReadOnlyRecommended) 'arquivo não foi marcado acidentalmente como somente leitura'
    Add-Check ($fullText.IndexOf([char]0xFFFD) -lt 0) 'texto não contém caractere Unicode de substituição'
    Add-Check ($fullText -notmatch '(?i)erro!\s*(fonte|referência|indicador)|error!\s*(reference|bookmark)') 'não existem referências ou indicadores quebrados visíveis'
    Add-Check ($fullText -notmatch '(?i)clique aqui|inserir texto|lorem ipsum|texto de exemplo|placeholder') 'não existem placeholders editoriais visíveis'

    $blankPages = New-Object System.Collections.Generic.List[int]
    for ($page = 1; $page -le $pageCount; $page++) {
        $startRange = $document.GoTo(1, 1, $page)
        $start = $startRange.Start
        if ($page -lt $pageCount) {
            $nextRange = $document.GoTo(1, 1, $page + 1)
            $end = $nextRange.Start
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($nextRange)
        }
        else {
            $end = $document.Content.End
        }
        $range = $document.Range($start, $end)
        $normalized = Normalize-Text ([string]$range.Text)
        $inlineOnPage = 0
        for ($shapeIndex = 1; $shapeIndex -le $document.InlineShapes.Count; $shapeIndex++) {
            $shape = $document.InlineShapes.Item($shapeIndex)
            if ($shape.Range.Information(3) -eq $page) { $inlineOnPage++ }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shape)
        }
        if ($normalized.Length -eq 0 -and $inlineOnPage -eq 0) { $blankPages.Add($page) }
        $preview = $normalized
        if ($preview.Length -gt 100) { $preview = $preview.Substring(0, 100) + '…' }
        $pageDetails.Add(('Página {0:D2}: {1} caracteres; {2} figura(s); início: {3}' -f $page, $normalized.Length, $inlineOnPage, $preview))
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($range)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($startRange)
    }
    Add-Check ($blankPages.Count -eq 0) 'não existem páginas inteiramente vazias' (($blankPages -join ', '))

    $orphanHeadings = New-Object System.Collections.Generic.List[string]
    for ($paragraphIndex = 1; $paragraphIndex -lt $document.Paragraphs.Count; $paragraphIndex++) {
        $paragraph = $document.Paragraphs.Item($paragraphIndex)
        $text = Normalize-Text ([string]$paragraph.Range.Text)
        $styleName = [string]$paragraph.Range.Style.NameLocal
        if ($text.Length -gt 0 -and $styleName -match '(?i)título|titulo|heading') {
            $headingStart = $paragraph.Range.Duplicate
            $headingStart.Collapse(1)
            $headingPage = $headingStart.Information(3)
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($headingStart)
            $nextIndex = $paragraphIndex + 1
            $nextText = ''
            $nextPage = $headingPage
            while ($nextIndex -le $document.Paragraphs.Count -and $nextText.Length -eq 0) {
                $nextParagraph = $document.Paragraphs.Item($nextIndex)
                $nextText = Normalize-Text ([string]$nextParagraph.Range.Text)
                $nextStart = $nextParagraph.Range.Duplicate
                $nextStart.Collapse(1)
                $nextPage = $nextStart.Information(3)
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($nextStart)
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($nextParagraph)
                $nextIndex++
            }
            if ($nextText.Length -gt 0 -and $nextPage -gt $headingPage) {
                $orphanHeadings.Add(('{0} (p. {1})' -f $text, $headingPage))
            }
        }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($paragraph)
    }
    Add-Check ($orphanHeadings.Count -eq 0) 'não existem títulos isolados no fim de página' (($orphanHeadings -join '; '))

    $figurePages = New-Object System.Collections.Generic.List[int]
    $figureDimensionsValid = $true
    for ($shapeIndex = 1; $shapeIndex -le $document.InlineShapes.Count; $shapeIndex++) {
        $shape = $document.InlineShapes.Item($shapeIndex)
        $figurePages.Add([int]$shape.Range.Information(3))
        if ($shape.Width -le 0 -or $shape.Height -le 0 -or $shape.Width -gt $document.PageSetup.PageWidth -or $shape.Height -gt $document.PageSetup.PageHeight) {
            $figureDimensionsValid = $false
        }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shape)
    }
    Add-Check ($figureDimensionsValid) 'dimensões das figuras cabem fisicamente na página'
    Add-Check (($figurePages -join ',') -eq '26,27') 'figuras permanecem nas páginas previstas' (($figurePages -join ', '))

    $splitReferences = New-Object System.Collections.Generic.List[int]
    for ($paragraphIndex = 236; $paragraphIndex -le 267; $paragraphIndex++) {
        $paragraph = $document.Paragraphs.Item($paragraphIndex)
        $startRange = $paragraph.Range.Duplicate
        $startRange.Collapse(1)
        $endRange = $paragraph.Range.Duplicate
        if ($endRange.End -gt $endRange.Start) { $endRange.End = $endRange.End - 1 }
        $endRange.Collapse(0)
        if ($startRange.Information(3) -ne $endRange.Information(3)) { $splitReferences.Add($paragraphIndex) }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($startRange)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($endRange)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($paragraph)
    }
    Add-Check ($splitReferences.Count -eq 0) 'referências bibliográficas não são divididas entre páginas' (($splitReferences -join ', '))

    $tocText = Normalize-Text ([string]$document.TablesOfContents.Item(1).Range.Text)
    $tocEntries = @('INTRODUÇÃO', 'REVISÃO BIBLIOGRÁFICA', 'METODOLOGIA', 'RESULTADOS', 'CONSIDERAÇÕES FINAIS', 'REFERÊNCIAS')
    foreach ($entry in $tocEntries) {
        Add-Check ($tocText.IndexOf($entry, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) ("sumário contém a seção: $entry")
    }

    $pdfText = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($pdfResolved))
    $pdfPageObjects = [regex]::Matches($pdfText, '/Type\s*/Page\b').Count
    $pdfDeclaredCounts = @([regex]::Matches($pdfText, '/Count\s+(\d+)') | ForEach-Object { [int]$_.Groups[1].Value })
    Add-Check ($pdfPageObjects -eq $pageCount) 'PDF possui o mesmo número de páginas do DOCX' ("PDF=$pdfPageObjects; DOCX=$pageCount")
    Add-Check ($pdfDeclaredCounts -contains $pageCount) 'árvore interna do PDF declara a paginação esperada' (($pdfDeclaredCounts -join ', '))
    Add-Check ($pdfText.StartsWith('%PDF-')) 'assinatura inicial do PDF é válida'
    Add-Check ($pdfText.TrimEnd([char]0).TrimEnd().EndsWith('%%EOF')) 'marcador final do PDF está presente'
}
finally {
    if ($document) { $document.Close($false) }
    if ($word) { $word.Quit() }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$failed = @($checks | Where-Object { -not $_.Passed })
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('Terceira revisão de integridade do documento do TCC')
$lines.Add('')
$lines.Add(('Resultado geral: {0}' -f $(if ($failed.Count -eq 0) { 'APROVADO' } else { 'REPROVADO' })))
$lines.Add(('Verificações: {0}' -f $checks.Count))
$lines.Add(('Falhas: {0}' -f $failed.Count))
$lines.Add('')
$lines.Add('Verificações:')
foreach ($check in $checks) {
    $suffix = if ($check.Detail) { " — $($check.Detail)" } else { '' }
    $lines.Add(('{0} {1}{2}' -f $(if ($check.Passed) { 'OK' } else { 'FALHA' }), $check.Description, $suffix))
}
$lines.Add('')
$lines.Add('Mapa de conteúdo por página:')
foreach ($detail in $pageDetails) { $lines.Add($detail) }
$lines.Add('')
$lines.Add('Observação: a revisão verifica estrutura, paginação, conteúdo textual por página, figuras, sumário e integridade do PDF. Ela complementa a revisão científica de 38 itens e a revisão de formatação de 17 itens.')

[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($reportResolved)) | Out-Null
[System.IO.File]::WriteAllLines($reportResolved, $lines, [System.Text.UTF8Encoding]::new($false))
$lines | ForEach-Object { Write-Output $_ }
if ($failed.Count -gt 0) { exit 1 }
