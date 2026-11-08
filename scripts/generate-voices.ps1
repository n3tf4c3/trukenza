# Gera as falas locais (apps/web/public/vozes/<personagem>.mp3 e falas.json) com o Kokoro-82M (Apache 2.0),
# num container isolado (scripts/vozes). Frases e elenco vêm de apps/web/src/performance.ts.
#   pwsh scripts/generate-voices.ps1            # baixa o modelo (~330 MB) numa pasta temporária e apaga no fim
#   pwsh scripts/generate-voices.ps1 -ManterCache   # guarda o modelo em %TEMP%\trukenza-vozes-cache para a próxima
param([switch]$ManterCache)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $repo 'apps\web\public\vozes'
$work = Join-Path $env:TEMP ('trukenza-vozes-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$cache = if ($ManterCache) { Join-Path $env:TEMP 'trukenza-vozes-cache' } else { Join-Path $work 'cache' }
New-Item -ItemType Directory -Path (Join-Path $work 'entrada'), $cache, $destination -Force | Out-Null
Push-Location $repo
try {
    # O catálogo do jogo é a fonte única das frases. O snippet só imprime JSON; quem grava é este script.
    $catalog = & node --input-type=module -e "import { VOICE_LINES, VOICE_CAST } from './apps/web/src/performance.ts'; process.stdout.write(JSON.stringify({ lines: VOICE_LINES, cast: VOICE_CAST, challenges: ['truco', 'retruco', 'vale-quatro', 'previa'] }));"
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler o catálogo de falas.' }
    [IO.File]::WriteAllText((Join-Path $work 'entrada\catalogo.json'), $catalog, [Text.UTF8Encoding]::new($false))
    docker build -q -t trukenza-vozes:local (Join-Path $PSScriptRoot 'vozes') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao montar a imagem do gerador.' }
    Get-ChildItem -LiteralPath $destination -File | Where-Object { $_.Extension -in '.mp3', '.wav', '.json' } | Remove-Item
    docker run --rm `
        -v "$(Join-Path $PSScriptRoot 'vozes'):/scripts:ro" `
        -v "$(Join-Path $work 'entrada'):/entrada:ro" `
        -v "${destination}:/saida" `
        -v "${cache}:/cache" `
        trukenza-vozes:local sh -c "python -I /scripts/gerar.py && python -I /scripts/murmurio.py"
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar as falas.' }
} finally {
    Pop-Location
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
