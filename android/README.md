# CapitalFlow Android wrapper

Esta pasta documenta a estratégia para empacotar o PWA CapitalFlow como aplicativo Android usando Trusted Web Activity (TWA/Bubblewrap), sem duplicar a aplicação web.

## Objetivo

- manter o CapitalFlow hospedado e atualizado pela mesma aplicação web;
- instalar no Android como app dedicado;
- usar splash/iconografia nativa mais controlável do que o splash automático do navegador/PWA;
- preservar links, autenticação e atualização do conteúdo web.

## Requisitos para gerar APK/AAB

1. Domínio HTTPS estável do CapitalFlow.
2. Android Studio / JDK / Bubblewrap ou equivalente no ambiente de build.
3. Um `applicationId` definitivo, por exemplo `app.capitalflow.mobile`.
4. Keystore de assinatura Android. A chave privada NÃO deve ser commitada no repositório.
5. `assetlinks.json` publicado em `/.well-known/assetlinks.json` com o fingerprint SHA-256 do certificado de assinatura.

## Observação importante

O navegador não pode, por conta própria, trocar o fluxo padrão “Instalar app” do PWA por um APK arbitrário. Para distribuir APK, o usuário precisa baixar/instalar o pacote Android ou instalar pela Play Store. Um TWA pode abrir exatamente o mesmo CapitalFlow sem barra do navegador quando a associação Digital Asset Links estiver correta.

## Build sugerido

Use Bubblewrap/Trusted Web Activity apontando para o manifest do CapitalFlow e gere primeiro um APK de teste. Depois configure assinatura de release e AAB para Play Store.

Não versionar arquivos `.jks`, `.keystore`, senhas ou fingerprints privados aqui.
