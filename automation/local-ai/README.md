# IA local do CapitalFlow

Camada local do WhatsApp baseada na imagem oficial do KoboldCpp e no modelo oficial Qwen3 4B Q4_K_M. O n8n consulta esta IA primeiro e preserva os fallbacks Gemini/Groq e bot convencional.

## Instalar e iniciar

```powershell
Copy-Item .env.example .env
.\baixar-modelo.ps1
.\iniciar.ps1
```

API no Windows: `http://127.0.0.1:5001`. API para o n8n: `http://koboldcpp:5001/v1/chat/completions`.

Esta configuração usa a GPU NVIDIA com offload parcial de 28 camadas. Para uma máquina sem NVIDIA, remova `gpus: all`, `--usecuda`, `--gpulayers` e `--lowvram` do Compose.

## Verificar

```powershell
Invoke-RestMethod http://127.0.0.1:5001/api/v1/model
```

O modelo e os downloads parciais ficam fora do Git. A porta externa escuta somente em localhost. O container não é privilegiado e não recebe acesso ao Docker socket.
