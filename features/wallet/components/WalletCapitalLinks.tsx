import React from 'react';
import { AlertCircle, Link2 } from 'lucide-react';
import type { PersonalWalletAccount } from '../../../services/personalWallet.service';
import type { CapitalSource } from '../../../types';
import { getCapitalLinkState } from '../domain/capitalLink';

export const WalletCapitalLinks: React.FC<{ accounts: PersonalWalletAccount[]; sources: CapitalSource[] }> = ({ accounts, sources }) => (
  <section aria-label="Integração com Capital" className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
    <h3 className="flex items-center gap-2 text-base font-semibold text-white"><Link2 size={18} className="text-blue-300"/>Integração com Capital</h3>
    <p className="mt-2 text-sm leading-relaxed text-slate-400">O vínculo é opcional. Confira a fonte de cada conta antes de movimentar recursos de empréstimos.</p>
    {!accounts.length ? <p className="mt-4 text-sm text-slate-400">Cadastre uma conta para configurar um vínculo.</p> : <ul className="mt-4 divide-y divide-slate-800">
      {accounts.map(account => {
        const link = getCapitalLinkState(account, sources);
        const warning = link.status === 'divergent' || link.status === 'unavailable';
        return <li key={account.id} className="py-3 first:pt-0 last:pb-0">
          <p className="break-words text-sm font-medium text-slate-200">{account.nickname}</p>
          <p className={`mt-1 flex items-start gap-1.5 break-words text-xs leading-relaxed ${warning ? 'text-amber-200' : 'text-slate-400'}`}>
            {warning && <AlertCircle size={14} className="mt-0.5 shrink-0"/>}
            <span>{link.status === 'unlinked' ? 'Sem vínculo com Capital' : link.status === 'unavailable' ? 'Fonte indisponível. Confira o vínculo.' : link.status === 'divergent' ? `${link.source?.name} · saldos divergentes; confira antes de movimentar.` : `${link.source?.name} · saldos conferem`}</span>
          </p>
        </li>;
      })}
    </ul>}
  </section>
);
