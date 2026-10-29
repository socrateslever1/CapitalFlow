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

## Configurar com um comando (WSL/Linux, uma vez)

O APK atualmente instalado com certificado temporario **nao pode ser
atualizado sem reinstalacao**. Primeiro confirme que dados importantes
estao sincronizados com o Supabase e faca backup dos dados locais.

Num computador com WSL/Linux, Java (`keytool`) e GitHub CLI (`gh`)
autenticado, execute a partir do clone do repositorio:

```bash
bash scripts/setup-android-release-signing.sh
```

Este script gera uma unica keystore em
`~/.config/capitalflow/android-signing/capitalflow-release.jks`
(ou reutiliza a existente), pergunta sua senha localmente (sem ecoar),
grava os quatro GitHub Actions Secrets via `gh secret set` e dispara
um workflow de assinatura. **Mantenha backup offline da chave e senha**.
Nunca cole senha, chave PKCS12/JKS ou valor Base64 nesta conversa.

Depois da compilacao, baixe a versao de assinatura permanente em
https://github.com/socrateslever1/CapitalFlow/releases/download/android-preview/CapitalFlow-Android.apk
e instale apos remover a antiga versao debug, preservando antes os
dados locais. **A partir dessa primeira instalacao assinada**, futuras
versoes com o mesmo certificado e `versionCode` crescente podem ser
atualizadas por cima do aplicativo.

A distribuicao publica nunca mais troca silenciosamente o certificado
pelo debug da maquina virtual de compilacao. Se a keystore mudar, o
workflow rejeita o APK comparando certificados da release anterior.

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
   https://github.com/socrateslever1/CapitalFlow/releases/tag/android-signed-beta
   (tambem em `android-preview`, o endereco de download anterior).

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

## Barra de status e navegacao do Android (15/16, tablets e modo janela)

O Android 15+ aplica desenho *edge-to-edge*. O CapitalFlow nao deve
usar altura fixa para a barra de status nem aplicar simultaneamente
padding no WebView e na Activity. A `native/android/MainActivity.java`
usa `WindowInsetsCompat.Type.systemBars() | Type.displayCutout()`
para calcular os recuos de cima/baixo/laterais no container nativo.
Em seguida zera esses tipos de inset para os filhos usando
`new WindowInsetsCompat.Builder(...).setInsets(types, Insets.NONE)`,
preservando o inset de teclado/IME. Assim o cabeçalho nao fica atras do
relogio/notificacoes e o rodape nao fica sob os controles do Android,
inclusive em modo paisagem, tablets, recortes e janelas redimensionaveis.

O script `scripts/android/apply-native-shell.py` injeta a Activity a
cada `npx cap sync android`, antes das builds. O `body` usa
`data-capacitor-android` para remover padding CSS so no app nativo;
o navegador/PWA continua com safe areas CSS. **Nao duplicar** os
insets no cabecalho, body ou outros wrappers. Validar em aparelho
fisico com navegacao por gestos e por tres botoes.

## Ícone oficial de instalação e inicialização

O ícone do CapitalFlow usa o monograma **CF** branco e verde-água,
sem marcas genéricas do Capacitor, sobre fundo azul-marinho. A origem
revisável é `assets/branding/capitalflow-mark.webp`, derivada da
arte minimalista oficial selecionada. O recurso não depende de IA em
tempo de execução.

Como o GitHub Actions recria completamente a pasta `android/`,
a etapa **Install official CapitalFlow icon into Android installer**
executa sempre depois de `npx cap sync android` e antes da compilação,
com `scripts/android/install_launcher_icon.py`. Ela gera os recursos
`mipmap-mdpi` a `mipmap-xxxhdpi` e ícones redondos, adaptativos,
monocromáticos (Android 13+) e suas declarações de cores. O manifesto
nativo aponta para `@mipmap/ic_launcher` e
`@mipmap/ic_launcher_round`; estes são os recursos vistos na
caixa de instalação **“Atualizar este app?”** e na tela inicial do
Android. Sem mudar o `appId`, assinatura, dados ou backend.

Em versões novas, o launcher Android pode manter o ícone anterior em
cache por algum tempo; o instalador e o sistema utilizam os novos
recursos do APK assinado.
