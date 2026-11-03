/**
 * Mensagens de erros de emissão: detalhes do banco ficam exclusivamente no log técnico.
 * As mensagens do formulário devem ser legíveis e não expor SQL ou dados cadastrais.
 */
export function formatContractSaveError(error: unknown): string {
  const object = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = String(object.code ?? '').toUpperCase();
  const message = error instanceof Error
    ? error.message
    : typeof object.message === 'string'
      ? object.message
      : typeof error === 'string' ? error : '';
  const normalized = message.toLowerCase();

  if (code === '23505' || /duplicate key|unique constraint|already exists/i.test(message)) {
    return 'Este contrato ou cadastro já existe. Atualize a lista antes de tentar novamente.';
  }
  if (code === '23503' || /foreign key constraint/i.test(message)) {
    return 'O cliente ou a fonte de capital não está mais disponível. Atualize os dados e tente novamente.';
  }
  if (code === '42501' || /row-level security|permission denied|unauthorized|forbidden/i.test(message)) {
    return 'Você não tem permissão para emitir este contrato com o perfil selecionado. Entre novamente ou verifique o acesso.';
  }
  if (code === '23514' || code === '23502' || /check constraint|not-null constraint|null value in column/i.test(message)) {
    return 'Há dados obrigatórios ou valores incompatíveis com as condições do contrato. Confira os campos.';
  }
  if (code === 'PGRST204' || code === '42703' || /schema cache|column .* does not exist/i.test(message)) {
    return 'O cadastro de contratos precisa de uma atualização do sistema. A emissão foi interrompida com segurança.';
  }
  if (/failed to fetch|network|connection|timeout|offline/i.test(message)) {
    return 'Sem conexão com o servidor. Verifique a internet e a lista de contratos antes de tentar novamente.';
  }
  // Mensagens de validação de negócio escritas pelo próprio aplicativo,
  // nunca SQL, stack traces ou respostas brutas do servidor.
  const userMessages = [
    'Selecione uma fonte de capital',
    'A fonte de capital selecionada',
    'Cliente marcado como Somente Capital',
    'Para reduzir o capital',
    'O contrato pode ter sido gravado',
    'O capital do contrato deve',
    'A distribuição deve',
    'A composição por várias fontes',
    'Perfil inválido.',
    'Entre novamente para salvar',
    'Este contrato possui um acordo',
  ];
  if (userMessages.some(prefix => normalized.startsWith(prefix.toLowerCase()))) return message;
  return 'Não foi possível emitir o contrato. Nenhuma nova tentativa automática foi realizada. Confira a lista de contratos antes de tentar novamente.';
}
