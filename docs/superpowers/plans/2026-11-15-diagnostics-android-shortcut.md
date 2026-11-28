# Diagnóstico local e atalho Android

**Goal:** implementar as duas frentes autorizadas pelo titular; lote permanece fora do escopo.
**Architecture:** React/TypeScript com diagnóstico local limitado e isolado por perfil, habilitado somente após confirmação existente de superadmin no servidor. Plugin Capacitor Java exibe notificação silenciosa opcional e abre os formulários existentes, sem executar transações.
**Design aprovado na conversa:** painel copiável junto ao Admin e notificação de gasto/entrada controlada no Perfil. A notificação não usa sobreposição, não intercepta URLs e não mostra valores. Sem coleta remota, crash reporting nativo ou garantia de permanência após reboot/dispensa pelo Android.

## Restrições e revisão
- Nenhuma alteração em RPC, migration, ledger, RLS ou operações financeiras.
- Logs não armazenam mensagens livres/payloads; guardar classificação, origem, versão e frames técnicos limitados. Máximo 100 grupos, retenção de 7 dias.
- Captura somente durante sessão master confirmada; troca de perfil desliga captura. Exportação exclusivamente no Admin autorizado.
- Atalho exige sessão e autorização atuais; cold/warm launch, permissão negada, logout e troca de conta precisam ser tratados.
- Preferência Android por perfil; desativação/logout remove notificação. Atalhos apenas navegam; confirmação financeira continua no formulário original.

## Execução
- [x] Testes de diagnóstico: privacidade, deduplicação, limites, isolamento, expiração e storage indisponível.
- [x] Serviço local, captura global/console/React/interface e painel Admin copiável com estado vazio e limpar.
- [x] Testes de contrato Android (análise estática) e geração idempotente de manifest/plugin. Cold/warm launch e callbacks de permissão ainda exigem APK instalado.
- [x] Plugin Java, template do build, bridge/hook e controle no Perfil; reutilizar FAB para abrir formulários.
- [x] Testes dedicados, quality e wallet-visual-next aprovados; revisão corrigiu ciclo de sessão dependente de navegação. Layout desktop visto em prévia isolada com dados fictícios; não valida integração autenticada nem celular.

## Decisões da revisão
- `navigate` fica em ref; somente troca de perfil/autorização encerra sessão do plugin.
- O armazenamento legado `cm_last_boot_error` com texto livre foi removido e é limpo no boot.
- Sem JDK/projeto Gradle local: compilação Java, assinatura e release APK não foram verificadas. Nenhuma publicação foi feita.

## Agentes do projeto
AGENTS.md protege contratos financeiros e exige evidências de release. As definições em `.agents/skills/impeccable/agents` são especialistas de assets, aplicação de edições, documentação e revisão visual; não são agentes de produção nem permissões de backend. `.codex/hooks.json` chama verificação Impeccable após edições e ao terminar; não substitui testes financeiros/Android.

Amostra adicional dos agentes internos: `ai/tools/core/permissions.ts` exige sessão, usuário, perfil e permissões declaradas; `ai/tools/core/registry.ts` verifica autorização antes da execução; `ai/skills/integration/intentRouter.ts` aceita somente intents conhecidos. As suítes de AI/skills/tools/evals do quality passaram. Isto é uma análise de estrutura/contratos, não uma auditoria completa de produção. O diagnóstico novo não chama agentes de IA nem executa correções automáticas.
