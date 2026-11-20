# CapitalFlow para iPhone e iPad

## Estado atual
- Código canônico: **este mesmo repositório** (React/Vite, Supabase, contratos, Carteira).
- Android: APK assinada no fluxo próprio. Não se instala APK no iPhone.
- iPhone/iPad: web app pode ser instalado pela opção **Compartilhar > Adicionar à Tela de Início** no Safari.
- Não existe projeto duplicado no Floot; não abrir outro SaaS e não duplicar Supabase, usuários, contratos nem ledger.

## Validação nativa iOS
- Workflow `ios-build-validation.yml`: gera temporariamente o projeto iOS usando Capacitor **7.6.10**, mesma versão do runtime do repositório, e compila no simulador usando macOS + Xcode, **sem assinatura**.
- Usa o mesmo `appId` `com.socrateslever.capitalflow` e os mesmos recursos do build web.
- Essa validação só comprova compatibilidade de compilação; **não produz .ipa distribuível**, não instala em iPhone real e não é uma publicação na App Store.
- Nenhuma mudança no banco, callbacks de login, RLS, RPCs, contabilidade financeira ou workflow Android.

## Para distribuição oficial
1. Configurar Apple Developer Program e o App Store Connect; cadastrar bundle ID, certificados e perfis de provisioning, sem armazenar segredos em arquivos ou em logs.
2. Confirmar naming, privacidade, permissões e uso do WebView segundo regras da App Store; criar ícone e splash iOS oficiais.
3. Revisar funcionalidades com tratamento exclusivo Android (instalação APK, permissões, botões de navegação) para que sejam inativas no iPhone, e funcionalidades comuns (compartilhamento, PDF, downloads, upload, login e abertura de links) no WKWebView.
4. Executar testes em iPhone/iPad real, validar login e fluxos financeiros, push e links externos.
5. Gerar archive de distribuição **assinado** e enviar pelo Xcode/CI autorizado ao TestFlight; só então submeter para revisão da App Store.
6. A distribuição iOS tem atualização por App Store/TestFlight, **não** pelo instalador APK Android.

## Critérios de conclusão
- Simulador: workflow macOS verde.
- Produção iOS: build assinada, TestFlight instalado e teste no dispositivo, aprovação e publicação Apple. Nenhuma etapa é presumida.
