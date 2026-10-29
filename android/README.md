# CapitalFlow Android — APK hibrido (Capacitor)

## Fonte unica

O APK usa a mesma aplicacao React/Vite do SaaS web. O backend de usuarios,
contratos, parcelas e carteira continua sendo o Supabase existente.
**Nao criar um segundo banco, ambiente financeiro ou aplicacao Floot espelhada.**

O aplicativo instala uma copia da interface no Android (WebView Capacitor). Os
dados persistentes sao compartilhados pelo Supabase; a sessao de autenticacao
fica separada em cada dispositivo. Operacoes financeiras continuam online e
sujeitas a RLS, autenticacao, autorizacao e validacoes do backend.

## Compilacao automatica

O GitHub Actions `.github/workflows/android-apk.yml` executa em pull requests,
em pushes para `main` que afetem o app e manualmente. O processo:

1. Faz instalacao das dependencias, executa testes e gera `dist/`.
2. Recria `android/` **somente no runner descartavel** (esta pasta do repositorio
   contem apenas esta documentacao) e sincroniza o projeto Capacitor 7.
3. Compila `assembleDebug`, valida a assinatura e gera o SHA-256.
4. Publica o artefato `CapitalFlow-Android-debug`, com `app-debug.apk`.

Para instalar em um telefone, abra a execucao concluida em
GitHub > Actions > CapitalFlow Android APK e baixe o artefato. APK debug serve
para testes; a assinatura debug gerada num runner pode mudar entre execucoes,
impedindo atualizacao por cima sem desinstalar.

## Web e APK nao sao equivalentes em atualizacao

- Web/PWA: a interface e publicada na hospedagem e o usuario recebe o aviso
  de atualizacao via `/version.json`.
- APK Capacitor: o HTML e JS ficam empacotados; alteracoes de interface exigem
  **gerar e distribuir um novo APK**. Nao carregar `server.url` remoto em
  producao para simular atualizacao, pois e uma opcao de live-reload.
- Os dados online nao precisam ser migrados quando um APK e atualizado.

Para distribuicao de producao com atualizacoes instalaveis, configurar
**keystore de release estavel**, secrets do repositorio, versionamento do
Android `versionCode`, build assinada e preferencialmente AAB/Play Store.
Nunca enviar uma keystore, senha ou service_role ao repositorio ou chat.

## Pontos que exigem testes no Android real

Autenticacao/sessao, camera para leitura de cartoes, arquivos, upload,
impressoes/compartilhamento, notificacoes e links externos de pagamento.
O endpoint Express `/api/infinitepay/checkout` usa origem relativa: num APK
local `https://localhost` nao aponta para o backend web. A Edge Function
Supabase deve ser a origem autorizada desse fluxo (sem introduzir uma segunda
logica de pagamentos); validar antes de liberar pagamentos via APK.
Nao habilitar operacoes financeiras offline sem protocolo transacional seguro.


## Android instalado com erro "App nao instalado"

Um APK debug e tecnicamente assinado, mas `assembleDebug` usa uma chave
que o GitHub runner gera de novo. Assinaturas diferentes para o mesmo
`appId` (`com.socrateslever.capitalflow`) impedem atualizacoes. O Android
tambem usa a mesma mensagem generica para falhas de versao, integridade,
permissao de fonte desconhecida ou politicas do dispositivo. A Samsung pode
bloquear instalacoes de APK fora da loja pelo **Bloqueador automatico**.
Nunca confundir assinatura valida com aprovacao da Play Store.

## Preparar a assinatura PERMANENTE de producao (uma unica vez)

O proprietario do repositorio deve gerar e conservar, fora do GitHub publico,
o arquivo `capitalflow-release.jks` e suas senhas. Nao enviar keystore nem
senhas no chat ou no codigo. Um exemplo em ambiente de desenvolvimento:

```bash
keytool -genkeypair -v \
  -keystore capitalflow-release.jks \
  -storetype PKCS12 \
  -keyalg RSA -keysize 3072 -validity 10000 \
  -alias capitalflow
```

No GitHub > Settings > Secrets and variables > Actions > New repository secret,
cadastrar **quatro segredos**:

| Segredo | Conteudo |
| --- | --- |
| `ANDROID_RELEASE_KEYSTORE_BASE64` | Conteudo Base64 do arquivo `.jks` (sem linhas extras) |
| `ANDROID_RELEASE_STORE_PASSWORD` | Senha de armazenamento do `.jks` |
| `ANDROID_RELEASE_KEY_ALIAS` | Alias da chave (no exemplo, `capitalflow`) |
| `ANDROID_RELEASE_KEY_PASSWORD` | Senha da chave privada (em PKCS12 geralmente igual a do armazenamento) |

Em Linux, `base64 -w 0 capitalflow-release.jks` produz o valor do primeiro
segredo; em outros ambientes, usar ferramenta equivalente. Base64 nao e
criptografia: **somente em um GitHub Actions Secret**, nunca em arquivo
versionado. Fazer backup offline da keystore e senhas: perde-las impede
atualizacoes compativeis do APK existente.

Com os quatro segredos, um push em `main` passa a:
1. Testar o SaaS, gerar o Capacitor e montar o APK debug apenas como artefato CI.
2. Definir `versionCode` crescente a partir de `GITHUB_RUN_NUMBER`.
3. Compilar `assembleRelease`, alinhar o APK (`zipalign`) e assinar
   com `apksigner` usando a keystore estavel.
4. Verificar a assinatura, rejeitar certificados Android Debug, calcular
   SHA-256 e publicar a beta assinada em
   https://github.com/socrateslever1/CapitalFlow/releases/tag/android-signed-beta.

Se faltar qualquer segredo, a publicacao **assinada e ignorada** com aviso
visivel no GitHub Actions; a CI nao gera uma chave substituta descartavel
nem apresenta o debug APK como producao.

A primeira migracao do APK debug para APK assinado de producao exige
desinstalacao da versao debug antiga por causa da assinatura diferente.
Antes de desinstalar, confirmar que os dados foram sincronizados com o
Supabase e preservar dados locais essenciais. Depois, novas versoes
assinadas com a MESMA keystore poderao atualizar a instalacao.

Uma assinatura de publicacao valida nao e automaticamente uma certificacao
de confiabilidade da Samsung/Google. A distribuicao ideal para nao exigir
sideload e via Play Store/Galaxy Store, sujeita aos processos de revisao da
loja. O Bloqueador automatico do Samsung so deve ser desligado
temporariamente pelo proprietario, se ele confiar no APK oficial, e religado
apos instalar. Nao desabilitar Play Protect.
