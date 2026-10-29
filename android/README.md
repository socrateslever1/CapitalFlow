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
