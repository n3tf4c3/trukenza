param([string]$Voice = 'Microsoft Daniel')
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $repo 'apps\web\public\vozes'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Push-Location $repo
try {
    # O catálogo do jogo é a fonte única das frases. Nenhum arquivo ou processo é criado pelo snippet.
    $manifest = & node --input-type=module -e "import { SPOKEN } from './apps/web/src/performance.ts'; process.stdout.write(JSON.stringify(SPOKEN));"
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler o catálogo de falas.' }
    $lines = $manifest | ConvertFrom-Json
    Add-Type -AssemblyName System.Speech
    $speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
    try {
        $speaker.SelectVoice($Voice)
        $speaker.Rate = 1
        $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
        foreach ($line in $lines.PSObject.Properties) {
            if ($line.Name -notmatch '^[a-z-]+$') { throw 'Nome de fala inválido.' }
            $file = Join-Path $destination ($line.Name + '.wav')
            $speaker.SetOutputToWaveFile($file, $format)
            if ($line.Name -in @('truco', 'retruco', 'vale-quatro', 'previa')) {
                # O acento fica na chamada, e a provocação vem logo depois, sem uma longa pausa.
                $parts = ([string]$line.Value) -split '(?<=[!?])\s+'
                $phrases = foreach ($part in $parts) {
                    $safe = [System.Security.SecurityElement]::Escape($part)
                    if ($part -eq 'Vai encarar?') {
                        '<break time="70ms"/><prosody rate="+8%" pitch="-6%" volume="90">' + $safe + '</prosody>'
                    } else {
                        '<prosody rate="-8%" pitch="-8%" volume="100"><emphasis level="strong">' + $safe + '</emphasis></prosody>'
                    }
                }
                $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">' + ($phrases -join '') + '</speak>'
                $speaker.SpeakSsml($ssml)
            } else {
                $speaker.Speak([string]$line.Value)
            }
            $speaker.SetOutputToNull()
            Write-Output ($line.Name + ': ' + (Get-Item -LiteralPath $file).Length + ' bytes')
        }
    } finally { $speaker.Dispose() }
    & node scripts/trim-voices.ts
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao normalizar as falas.' }
} finally { Pop-Location }
