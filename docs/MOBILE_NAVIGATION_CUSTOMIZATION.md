# Personalização dos menus do CapitalFlow — 06/11/2026

## Barra inferior de celular
- A barra utiliza todos os oito destinos já disponíveis. A ordem é individual por perfil; o usuário não perde botões ao reorganizar.
- Toque no ícone pequeno de organização no canto direito, arraste as opções por toque/mouse e escolha **Concluir**. **Cancelar** descarta as alterações ainda não concluídas.
- O arraste é ativado somente no modo de edição. No modo normal, o gesto horizontal continua deslocando a barra e toques continuam navegando.
- A nova ordem é aplicada e escrita imediatamente em armazenamento local específico do perfil; o Supabase sincroniza uma vez por conclusão.
- Sem rede ou com atualização recusada, a ordem local permanece e a UI informa a sincronização pendente. Na próxima inicialização autenticada e conectada, uma tentativa de reenvio é realizada.
- A coluna `perfis.ui_mobile_nav_order` mantém o layout em outros dispositivos do mesmo perfil. RLS e as políticas de atualização já existentes continuam vigentes, sem tabelas novas ou acesso público.
- Não há consulta ao Supabase por arraste individual; a gravação ocorre apenas em **Concluir**.

## Menus desktop
- **Perfil > Interface > Personalizar Menus** mantém as opções superiores e laterais independentes da ordem móvel.
- A edição usa atualização verificada no Supabase: erro e zero linhas gravadas não são tratados como sucesso.
- A ordem fica armazenada por perfil no navegador até sincronizar. As ações da UI são desabilitadas durante gravação, com resposta visível.

## Ensaios
- `npm run test:navigation-persistence`, `npm run test:quality`, build TypeScript, build Android e release assinada.
- Homologação manual no Galaxy S25+ e navegador: arrastar, concluir, recarregar, sair, entrar, internet desligada/ligada, perfil diferente e gestos normais.
- Testar navegação e barra deslocável sem entrar no modo de edição; verificar leitura de valores da Carteira e que nenhum movimento financeiro foi tocado.
