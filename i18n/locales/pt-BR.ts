/**
 * Dicionário principal do CapitalFlow (português do Brasil).
 * Toda nova chave nasce aqui; os demais idiomas são obrigados pelo TypeScript a ter as mesmas chaves.
 * O teste tests/i18n/no-english-ui.test.mjs reprova qualquer valor em inglês neste arquivo.
 */
export const ptBR = {
  'language.label': 'Idioma',
  'language.description': 'Idioma dos menus e das mensagens do sistema. Valores, datas e moeda seguem o padrão brasileiro.',
  'language.saved': 'Idioma alterado para português.',
  'language.partial': 'As traduções estão sendo ampliadas aos poucos; telas ainda não traduzidas continuam em português.',

  'nav.DASHBOARD': 'Painel',
  'nav.DOSSIER': 'Extrato',
  'nav.CLIENTS': 'Clientes',
  'nav.LEGAL': 'Jurídico',
  'nav.SOURCES': 'Capital',
  'nav.PROFILE': 'Perfil',
  'nav.SETTINGS': 'Configurações',
  'nav.CONTRACT_DETAILS': 'Detalhes do contrato',
  'nav.SIMULATOR': 'Simulador',
  'nav.FLOW': 'Extrato',
  'nav.LEGAL_DOCUMENT_EDITOR': 'Editor de documentos',
  'nav.EXTRATO': 'Extrato',
  'nav.SUPPORT': 'Chat',
  'nav.REPORTS': 'Relatórios',
  'nav.MY_WALLET': 'Minha Carteira',
  'nav.PLATFORM_ADMIN': 'Administração',
  'nav.HUB': 'Menu',
  'navShort.MY_WALLET': 'Carteira',

  'errors.network': 'Sem conexão com o servidor. Verifique a internet e tente novamente.',
  'errors.invalidLogin': 'E-mail ou senha incorretos.',
  'errors.emailNotConfirmed': 'Confirme seu e-mail antes de entrar.',
  'errors.sessionExpired': 'Sua sessão expirou. Entre novamente.',
  'errors.permission': 'Você não tem permissão para esta ação.',
  'errors.duplicate': 'Este registro já existe.',
  'errors.timeout': 'O servidor demorou para responder. Tente novamente.',
  'errors.linkedRecord': 'Este registro está vinculado a outros dados e não pode ser alterado assim.',
  'errors.invalidData': 'Algum dado informado é inválido. Revise os campos.',
  'errors.rateLimit': 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.',
  'errors.server': 'O servidor não conseguiu concluir a operação. Tente novamente em instantes.',
  'errors.generic': 'Não foi possível concluir a operação. Tente novamente.',
} as const;

export type MessageKey = keyof typeof ptBR;
