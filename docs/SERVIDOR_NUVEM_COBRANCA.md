# Cobrança automática 24 horas em servidor na nuvem — passo a passo

**Para quem é:** o dono do CapitalFlow, sem precisar saber programação.
**Objetivo:** tirar o n8n + WhatsApp (WAHA) do seu computador e colocar num servidor que fica ligado sempre.
Hoje, se o computador desligar ou reiniciar, a régua de cobrança para.

Arquivos usados: pasta `automation/server/` (`docker-compose.yml`, `Caddyfile`, `.env.example`).

> ⚠️ **Regra de ouro:** nunca deixe o n8n do computador **e** o do servidor ligados ao mesmo tempo.
> Os dois tentariam cobrar a mesma lista. Desligue o do computador antes de ligar o do servidor (passo 9).

---

## 1. Contratar o servidor (VPS)
- Qualquer provedor de VPS com **Ubuntu 24.04**, **2 GB de memória** e **2 processadores** já basta.
  Exemplos: Hostinger, Contabo, DigitalOcean, Hetzner, Magalu Cloud. Faixa de R$ 30 a R$ 100/mês.
- Anote o **IP** do servidor e a **senha de acesso (root)** que o provedor enviar.

## 2. Criar o endereço (subdomínio)
- No painel onde está o seu domínio, crie um registro **A**: nome `automacao`, apontando para o **IP** do servidor.
- O endereço ficará assim: `automacao.seudominio.com.br`. Pode levar até 1 hora para funcionar.

## 3. Instalar o Docker no servidor
Entre no servidor (pelo terminal do provedor ou `ssh root@IP`) e cole:
```bash
curl -fsSL https://get.docker.com | sh
apt-get install -y git openssl
git clone https://github.com/socrateslever1/CapitalFlow.git /opt/capitalflow
cd /opt/capitalflow/automation/server
cp .env.example .env
```

## 4. Pegar os dados que já funcionam no seu computador
No **seu computador**, com o Docker aberto, rode no PowerShell:
```powershell
docker ps --format "{{.Names}}  {{.Image}}"
```
- Anote a imagem do WAHA (ex.: `devlikeapro/waha:2024.10.8`). Se o nome **não** começar com `devlikeapro/waha`,
  pare aqui e peça ajuda: pode ser uma imagem montada só no seu computador.

Depois veja os valores secretos que o n8n do computador usa (troque `NOME_DO_N8N` pelo nome mostrado acima):
```powershell
docker exec NOME_DO_N8N printenv CAPITALFLOW_PROFILE_ID CAPITALFLOW_N8N_SECRET WAHA_API_KEY
```
Guarde os três valores. **Não mande por WhatsApp nem e-mail.**

## 5. Preencher o arquivo `.env` no servidor
```bash
nano /opt/capitalflow/automation/server/.env
```
Preencha:
| Campo | O que colocar |
|---|---|
| `N8N_DOMAIN` | o endereço do passo 2 |
| `TZ` | o fuso do seu computador (Manaus/Cuiabá = `America/Manaus`; Brasília = `America/Sao_Paulo`) |
| `PAINEL_USUARIO` | um nome de usuário para abrir o painel |
| `PAINEL_SENHA_HASH` | gere com o comando abaixo e cole **entre aspas simples** |
| `N8N_ENCRYPTION_KEY` | gere com `openssl rand -hex 32` e **guarde uma cópia** em lugar seguro |
| `CAPITALFLOW_PROFILE_ID`, `CAPITALFLOW_N8N_SECRET`, `WAHA_API_KEY` | os valores do passo 4 |
| `WAHA_IMAGE` | a imagem do WAHA do passo 4 |
| `REDIS_PASSWORD` | gere com `openssl rand -hex 24` |

Gerar o hash da senha do painel:
```bash
docker run --rm caddy:2.8.4-alpine caddy hash-password --plaintext 'ESCOLHA_UMA_SENHA_FORTE'
```
Salvar no `nano`: `Ctrl+O`, `Enter`, `Ctrl+X`.

## 6. Ligar tudo
```bash
cd /opt/capitalflow/automation/server
docker compose up -d
docker compose ps
```
Todos devem aparecer como `running`. Abra `https://automacao.seudominio.com.br`:
o navegador pede o usuário/senha do passo 5 e depois o n8n pede para criar a conta de dono. Crie na hora.

## 7. Colocar os fluxos de cobrança no n8n
```bash
docker compose exec n8n n8n import:workflow --separate --input=/workflows
```
No painel do n8n, abra e **ative**:
- `CapitalFlow - Regua de Cobranca` (cobrança diária);
- o fluxo de cobranças manuais.

Deixe o **Atendimento WhatsApp** desligado, como está hoje. Se ele usar Redis, crie a credencial Redis no n8n
com host `redis`, porta `6379` e a senha `REDIS_PASSWORD`.

## 8. Conectar o WhatsApp no servidor
O WhatsApp precisa ser lido por QR Code de novo, agora no servidor.
1. No seu computador, abra um túnel seguro (o WAHA não fica exposto na internet):
   ```powershell
   ssh -L 3000:127.0.0.1:3000 root@IP_DO_SERVIDOR
   ```
   (deixe essa janela aberta enquanto lê o QR Code)
2. Abra `http://localhost:3000/dashboard` no navegador, informe a `WAHA_API_KEY`, inicie a sessão com o **mesmo nome**
   usado no computador e leia o QR Code com o celular do número de cobrança.
3. Feche o túnel digitando `exit`.

## 9. Desligar o do computador
No seu computador:
```powershell
docker stop NOME_DO_N8N NOME_DO_WAHA
```
E impeça que voltem sozinhos: `docker update --restart=no NOME_DO_N8N NOME_DO_WAHA`.

## 10. Apontar o botão "Cobrar agora" para o servidor
No arquivo de configuração do site/app (variáveis de ambiente do build), defina:
```
VITE_N8N_MANUAL_TRIGGER_URL=https://automacao.seudominio.com.br/webhook/capitalflow-manual-collections-trigger
```
Depois publique o site de novo e gere um novo APK.
Sem isso, o botão só acelera a cobrança no computador onde o Docker roda; nos demais aparelhos a fila é
processada pelo próprio n8n a cada 5 minutos (nada se perde, só demora um pouco mais).

## 11. Conferir
- No n8n, aba **Executions**: a régua deve rodar de hora em hora sem erro.
- Faça uma cobrança manual de teste com um contrato **seu**, não de cliente real.
- `docker compose logs -f n8n` mostra o que está acontecendo (Ctrl+C para sair).

## Manutenção
- **Atualizar o CapitalFlow no servidor:** `cd /opt/capitalflow && git pull && cd automation/server && docker compose up -d`.
- **Backup:** os dados ficam nos volumes `n8n_data` e `waha_sessions`. Guarde a `N8N_ENCRYPTION_KEY`.
- **Não troque versões** (n8n 1.50.0, Redis, Caddy, WAHA) sem teste. Atualize uma peça por vez.

## O que este pacote NÃO faz
- Não altera regras de cobrança, valores, juros, RPCs nem o banco: tudo continua decidido pelo Supabase.
- Não liga a IA local (KoboldCpp); o fluxo de cobrança hoje não a utiliza (`ai_used: false`).
- Não foi testado num servidor real ainda: a primeira subida deve ser acompanhada.
