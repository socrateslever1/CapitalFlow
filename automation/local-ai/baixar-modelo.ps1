[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$modelsDir = Join-Path $root 'modelos'
$fileName = 'Qwen3-4B-Q4_K_M.gguf'
$destination = Join-Path $modelsDir $fileName
$partial = "$destination.part"
$url = "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/$fileName"
$expectedSha256 = '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5'

New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
if ((Test-Path -LiteralPath $destination) -and -not $Force) {
  Write-Host "Modelo ja existe: $destination"
  exit 0
}

$rootPath = [System.IO.Path]::GetPathRoot($root)
$driveName = $rootPath.TrimEnd([char[]]@(':', '\'))
$drive = Get-PSDrive -Name $driveName
if ($drive.Free -lt 3GB) {
  throw 'Espaco insuficiente. Sao necessarios pelo menos 3 GB livres.'
}

Write-Host 'Baixando Qwen3 4B Q4_K_M oficial (aprox. 2,5 GB)...'
try {
  & curl.exe --fail --location --retry 5 --retry-delay 3 --continue-at - --output $partial $url
  if ($LASTEXITCODE -ne 0) {
    throw "curl encerrou com codigo $LASTEXITCODE."
  }
  if ((Get-Item -LiteralPath $partial).Length -lt 2GB) {
    throw 'O arquivo recebido e menor que o esperado.'
  }
  $actualSha256 = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $expectedSha256) {
    throw "Checksum SHA-256 invalido. Recebido: $actualSha256"
  }
  Move-Item -LiteralPath $partial -Destination $destination -Force
  Write-Host "Modelo instalado: $destination"
} catch {
  Write-Error "Falha ao baixar o modelo. $($_.Exception.Message)"
  exit 1
}
