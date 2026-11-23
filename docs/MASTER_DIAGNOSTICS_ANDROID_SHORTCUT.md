# Diagnóstico local e notificação de lançamento

## Diagnóstico
No Admin, o superadmin confirmado pelo servidor encontra **Diagnóstico do sistema**, com **Copiar relatório**, seleção manual e **Limpar diagnóstico**.

Captura erros globais JavaScript, promises não tratadas, `console.error`, boundary React, toasts de erro do hook compartilhado e falhas dos formulários rápidos de gasto/entrada. Não cobre todos os erros tratados silenciosamente em outros componentes. O registro é ativado após autorização e separado por perfil neste aparelho: até 100 grupos por 7 dias, com versão, tela, classificação, origem, horário e referência do bundle quando disponível. Mensagens livres, payloads, URLs, dados financeiros e stacks completos não são persistidos. Dados ficam no armazenamento local do aplicativo/navegador, sem envio remoto. Falhas de storage usam memória temporária.

Não é um crash reporter nativo nem um diagnóstico definitivo. Não reúne erros de outros usuários/aparelhos nem captura falhas anteriores à autorização. A área de Admin continua usando a autorização existente `is_platform_super_admin`; nenhum papel novo foi criado. Como qualquer dado local do aplicativo, o armazenamento não constitui uma barreira contra quem controla o próprio aparelho.

## Notificação compacta e destaque opcional (22/11/2026)

- Texto nativo simplificado: “Lançamento rápido” e “Toque para abrir a carteira”, sem repetir CapitalFlow no título. O corpo da notificação abre somente a Visão geral, sem acionar gastos. Ações com símbolos distintos e ícones nativos diferentes (gasto/entrada); Android 7+ pode ocultar os desenhos nativos, razão para os símbolos nos rótulos.
- `Perfil > Preferências & Menus > Lançamento rápido` agora contém opção `Destacar notificação` disponível no Android 8+. Ela utiliza canal secundário `capitalflow_quick_access_visible_v1` com importância `DEFAULT`, porém **sem som, vibração, heads-up, lockscreen ou foreground service**. O canal antigo `capitalflow_quick_access` permanece inalterado e a preferência é por perfil.
- A alteração de canal é explícita e reversível, reaproveitando o identificador de notificação. Se o usuário bloqueou o canal antigo ou o novo, a função respeita o bloqueio e exige ajuste nas configurações do Android. A ordenação final depende do sistema/Samsung e não pode ser garantida como primeiro item.
- Mantidos os dois PendingIntents imutáveis, exigência de sessão, confirmação dos formulários e cancelamento da notificação ao sair; nenhuma mutação financeira ou alteração de RLS/backend.
- Testes estáticos de arquitetura e contrato do wrapper, build Android/CI a verificar. Validação visual real em dispositivo físico pendente. Rollback: reverter commit; canal secundário criado permanece apenas nas configurações Android até ser excluído pelo usuário/sistema.

## Notificação Android
No Perfil do master, no APK atualizado, ativar **Notificação de lançamento** e conceder a permissão do Android quando solicitada. As ações **Lançar gasto** e **Registrar entrada** abrem os formulários existentes. Nenhum lançamento é confirmado automaticamente.

A notificação usa canal de baixa importância no modo normal e canal de importância padrão no modo destacado, criados sem som ou vibração. Preferências do Android prevalecem; não há sobreposição, valores ou exibição na tela bloqueada. A preferência é por perfil; sair remove a notificação. Não intercepta links de navegadores. Usa intents explícitos/imutáveis, aceita apenas as duas ações previstas e descarta ações de outro perfil.

Android 13+ exige permissão de notificações. O canal também pode ser bloqueado nas configurações do sistema. Android 14+ pode permitir dispensar notificações contínuas. Não há serviço de primeiro plano ou inicialização no boot; após reiniciar o aparelho, abrir/autenticar o CapitalFlow restaura a opção habilitada. Não promete permanência contra force-stop ou restrições do fabricante.

## Validação necessária no APK
- Compilar Java no workflow Android e verificar pacote, assinatura, versão monotônica, commit e asset publicado.
- Abrir gasto/entrada pelo app fechado e já aberto, com login pendente e após navegação comum.
- Negar/conceder permissão; bloquear canal; desativar opção; sair e trocar perfil.
- Conferir lock screen, teclado, voltar, confirmação única e ausência de bloqueio de toque no Chrome.

Testes locais: `npm run test:master-tools`, `python tests/architecture/android-quick-access-manifest.test.py`, `npm run test:quality` e `npm run test:wallet-visual-next`. Os testes de contrato Java são estáticos; não substituem execução no dispositivo.
