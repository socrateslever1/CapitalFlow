---
name: publicacao-verificada
description: Coordene build, revisão, release e deploy com verificação de integridade, rastreabilidade e rollback. Use quando o usuário pedir produção, publicar website ou gerar APK.
---

1. Verificar escopo, autorização de publicação, branch, commit, estado de CI e alterações não relacionadas.
2. Exigir testes obrigatórios aprovados, artefato de build identificado e plano de rollback.
3. Validar em staging os fluxos críticos com dados de teste e inspeção visual.
4. Para web, identificar origem do deploy, commit e versão servida; para APK, verificar packageId, versionCode, assinatura consistente, arquitetura e instalação/atualização em dispositivo pertinente.
5. Não expor segredos nem assinar binários com chaves geradas arbitrariamente; preservar cadeia de assinatura existente.
6. Publicar apenas mediante ação autorizada e ferramenta real disponível; registrar ID/link/commit retornado pela plataforma.
7. Executar smoke test pós-deploy; em falha, aplicar rollback autorizado ou bloquear, sem afirmar sucesso.
