import { supabase } from '../lib/supabase';

export const CURRENT_TERMS_VERSION = '2026-11-v1';
export const CURRENT_TERMS_HASH = 'cf-terms-2026-11-v1-disclaimer';

export interface TermsClause {
  number: number;
  title: string;
  body: string;
}

export const TERMS_CLAUSES: TermsClause[] = [
  {
    number: 1,
    title: 'Natureza da Plataforma',
    body: 'O CapitalFlow é uma ferramenta tecnológica de organização, controle e gestão de registros operacionais, fornecida no estado em que se encontra para uso autônomo do usuário.',
  },
  {
    number: 2,
    title: 'Responsabilidade Exclusiva pelo Uso',
    body: 'Todo contrato, valor, taxa, juros, multa, cobrança, documento ou dado inserido na plataforma é de inteira e exclusiva responsabilidade do usuário operador.',
  },
  {
    number: 3,
    title: 'Isenção dos Criadores',
    body: 'Os criadores e mantenedores do CapitalFlow atuam exclusivamente como desenvolvedores do software. Não prestam consultoria financeira, contábil ou jurídica, nem se responsabilizam por perdas, cobranças, negociações ou uso indevido do sistema.',
  },
  {
    number: 4,
    title: 'Conformidade Legal',
    body: 'Ao aceitar este termo, o usuário declara utilizar o sistema em total conformidade com a legislação vigente e assume integral responsabilidade civil, fiscal e legal por suas operações.',
  },
];

const localStorageKey = (identifier: string) =>
  `cf_terms_accepted_${CURRENT_TERMS_VERSION}_${identifier.trim().toLowerCase()}`;

export const hasAcceptedTermsLocal = (identifier?: string | null): boolean => {
  if (!identifier || typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage.getItem(localStorageKey(identifier)));
  } catch {
    return false;
  }
};

export const markAcceptedTermsLocal = (identifier?: string | null, acceptedAt?: string) => {
  if (!identifier || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      localStorageKey(identifier),
      JSON.stringify({
        version: CURRENT_TERMS_VERSION,
        hash: CURRENT_TERMS_HASH,
        acceptedAt: acceptedAt || new Date().toISOString(),
      })
    );
  } catch {
    // Ignora falha de armazenamento local em modo restrito.
  }
};

export async function recordTermsAcceptance(params: {
  profileId?: string | null;
  email?: string | null;
  origin?: string;
}): Promise<{ ok: boolean; acceptedAt: string }> {
  const acceptedAt = new Date().toISOString();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

  if (params.profileId) markAcceptedTermsLocal(params.profileId, acceptedAt);
  if (params.email) markAcceptedTermsLocal(params.email, acceptedAt);

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      return { ok: true, acceptedAt };
    }

    const { error: rpcError } = await supabase.rpc('accept_platform_terms', {
      p_terms_version: CURRENT_TERMS_VERSION,
      p_terms_hash: CURRENT_TERMS_HASH,
      p_user_agent: userAgent,
      p_origin: params.origin || 'WEB',
    });

    if (rpcError) {
      // Fallback caso a migration ainda não tenha sido aplicada no projeto remoto.
      await supabase.auth.updateUser({
        data: {
          terms_version: CURRENT_TERMS_VERSION,
          terms_hash: CURRENT_TERMS_HASH,
          terms_accepted_at: acceptedAt,
        },
      }).catch(() => undefined);

      if (params.profileId) {
        await supabase
          .from('perfis')
          .update({
            terms_accepted_at: acceptedAt,
            terms_version: CURRENT_TERMS_VERSION,
          })
          .eq('id', params.profileId)
          .then(() => undefined, () => undefined);
      }
    }
  } catch {
    // Mantém o aceite local para não travar o acesso caso o banco esteja offline.
  }

  return { ok: true, acceptedAt };
}

export async function hasUserAcceptedCurrentTerms(activeUser: {
  id?: string;
  email?: string;
  terms_version?: string;
  terms_accepted_at?: string;
} | null): Promise<boolean> {
  if (!activeUser || !activeUser.id || activeUser.id === 'DEMO') return true;

  if (
    hasAcceptedTermsLocal(activeUser.id) ||
    hasAcceptedTermsLocal(activeUser.email) ||
    (activeUser.terms_version === CURRENT_TERMS_VERSION && Boolean(activeUser.terms_accepted_at))
  ) {
    return true;
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData?.user?.user_metadata;
    if (meta?.terms_version === CURRENT_TERMS_VERSION && meta?.terms_accepted_at) {
      markAcceptedTermsLocal(activeUser.id, meta.terms_accepted_at);
      if (activeUser.email) markAcceptedTermsLocal(activeUser.email, meta.terms_accepted_at);
      return true;
    }

    const { data: profileRow } = await supabase
      .from('perfis')
      .select('terms_version, terms_accepted_at')
      .eq('id', activeUser.id)
      .maybeSingle();

    if (profileRow?.terms_version === CURRENT_TERMS_VERSION && profileRow?.terms_accepted_at) {
      markAcceptedTermsLocal(activeUser.id, profileRow.terms_accepted_at);
      if (activeUser.email) markAcceptedTermsLocal(activeUser.email, profileRow.terms_accepted_at);
      return true;
    }
  } catch {
    // Se a coluna ainda não existir no banco, verifica apenas metadados/localStorage.
  }

  return false;
}

