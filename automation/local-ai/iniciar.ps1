$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$modelName = if ($env:KCPP_MODEL_FILE) { $env:KCPP_MODEL_FILE } else { 'Qwen3-4B-Q4_K_M.gguf' }
$model = Join-Path (Join-Path $root 'modelos') $modelName

if (-not (Test-Path -LiteralPath $model)) {
  throw 'Modelo ausente. Execute .\baixar-modelo.ps1 primeiro.'
}

docker compose --project-directory $root -f (Join-Path $root 'docker-compose.yml') up -d
docker compose --project-directory $root -f (Join-Path $root 'docker-compose.yml') ps

