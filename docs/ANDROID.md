# CapitalFlow Android (híbrido)

A versão Android reaproveita o frontend React/Vite e as mesmas RPCs e Edge Functions Supabase da Web. Nenhum cálculo de pagamento ou estorno é transportado para lógica nativa.

## Gerar o APK

Em **GitHub → Actions → CapitalFlow Android APK → Run workflow**, execute o build. Após o sucesso, abra o run e baixe o artefato **CapitalFlow-Android-debug** (ZIP com o `app-debug.apk`).

O APK é **debug**, adequado para instalação e teste; não é uma versão assinada para Play Store. A assinatura de produção requer keystore, armazenamento em GitHub Secrets, versão e testes adicionais.

## Funcionamento

- O pacote da interface web é compilado em `dist/` e embarcado no APK via Capacitor.
- O frontend comunica-se com o projeto Supabase existente usando somente credenciais públicas.
- Configurações opcionais do repositório: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em GitHub Actions Variables. Se não forem definidas, o aplicativo mantém os fallbacks públicos existentes no projeto.
- Nunca configure `service_role`, `sb_secret_`, banco de dados com senha, nem chaves privadas em variáveis `VITE_`.
- O bundle é local, mas autenticação e operações financeiras precisam de internet. Não confirme pagamentos offline ou assuma sucesso após perda de conectividade.
- Faça ensaios no Android de login, sessão persistida, links de recuperação, portal, recibos, upload/download, PIX, permissões e transações financeiras antes de liberar a produção.

## Desenvolvimento

```bash
npm ci
npm install --no-save --package-lock=false @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

A pasta `android/` é gerada durante o workflow. Para customizações Android persistentes, versionar posteriormente um projeto nativo fixo e dependências travadas no lockfile.
