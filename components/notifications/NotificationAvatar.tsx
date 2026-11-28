import React, { useState } from 'react';
import { BankLogo } from '../wallet/BankLogo';
import { AppIcon, type AppIconName } from '../icons/AppIcons';

type NotificationLike = {
  title: string;
  message?: string;
  type: string;
  item_type?: string;
  metadata?: any;
};

export type NotificationTone = 'sky' | 'amber' | 'rose' | 'emerald' | 'violet' | 'slate';

/** Cor do aviso pelo que ele significa, não só pelo nível técnico. */
export function notificationTone(notif: NotificationLike): NotificationTone {
  const meta = notif.metadata || {};
  if (notif.item_type === 'fatura') return meta.kind === 'DUE' ? 'amber' : 'sky';
  if (notif.item_type === 'parcela') {
    if (meta.milestone === 'd_minus_2') return 'sky';
    if (meta.milestone === 'due_today') return 'amber';
    if (meta.milestone) return 'rose';
  }
  if (notif.item_type === 'pagamento') return 'emerald';
  if (notif.item_type === 'cliente' || notif.item_type === 'admin_signup') return 'violet';
  if (notif.type === 'error') return 'rose';
  if (notif.type === 'warning') return 'amber';
  if (notif.type === 'success') return 'emerald';
  return 'slate';
}

export const toneClasses: Record<NotificationTone, { stripe: string; ring: string; text: string; bg: string; dot: string }> = {
  sky: { stripe: 'bg-sky-400', ring: 'ring-sky-400/40', text: 'text-sky-300', bg: 'bg-sky-500/15', dot: 'bg-sky-400' },
  amber: { stripe: 'bg-amber-400', ring: 'ring-amber-400/40', text: 'text-amber-300', bg: 'bg-amber-500/15', dot: 'bg-amber-400' },
  rose: { stripe: 'bg-rose-400', ring: 'ring-rose-400/40', text: 'text-rose-300', bg: 'bg-rose-500/15', dot: 'bg-rose-400' },
  emerald: { stripe: 'bg-emerald-400', ring: 'ring-emerald-400/40', text: 'text-emerald-300', bg: 'bg-emerald-500/15', dot: 'bg-emerald-400' },
  violet: { stripe: 'bg-violet-400', ring: 'ring-violet-400/40', text: 'text-violet-300', bg: 'bg-violet-500/15', dot: 'bg-violet-400' },
  slate: { stripe: 'bg-slate-500', ring: 'ring-slate-500/40', text: 'text-slate-300', bg: 'bg-slate-500/15', dot: 'bg-slate-400' },
};

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  .map(part => part[0]?.toUpperCase() || '').join('') || '?';

const inferBankFromNotification = (notif: NotificationLike): string => {
  const meta = notif.metadata || {};
  const explicit = String(meta.bank || meta.institution || meta.card_name || meta.cardName || '').trim();
  if (explicit) return explicit;
  const msg = String(notif.message || '').trim();
  const colonIdx = msg.indexOf(':');
  if (colonIdx > 1 && colonIdx <= 36) {
    return msg.slice(0, colonIdx).trim();
  }
  return '';
};

/**
 * Imagem do aviso: foto do cliente quando houver, iniciais do cliente, logo do banco do cartão
 * ou ícone próprio do CapitalFlow, sempre no mesmo quadro arredondado (`h-10 w-10 rounded-xl`).
 */
export const NotificationAvatar: React.FC<{ notif: NotificationLike }> = ({ notif }) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const meta = notif.metadata || {};
  const tone = toneClasses[notificationTone(notif)];
  // Mesmo quadro para foto, iniciais, logo do banco e ícone: tamanho, canto e borda iguais.
  const frame = 'mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-white/10';

  if (meta.avatar_url && !photoFailed) {
    return <img src={meta.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer"
      onError={() => setPhotoFailed(true)} className={`${frame} object-cover`} />;
  }
  if (meta.client_name) {
    return <span aria-hidden="true" className={`${frame} flex items-center justify-center text-[13px] font-black ${tone.bg} ${tone.text}`}>
      {initials(String(meta.client_name))}
    </span>;
  }
  if (notif.item_type === 'fatura') {
    const bankName = inferBankFromNotification(notif);
    if (bankName) {
      return <span className={`${frame} flex items-center justify-center`}>
        <BankLogo name={bankName} size="md" className="!h-full !w-full !rounded-none" />
      </span>;
    }
  }
  const iconName: AppIconName = notif.item_type === 'fatura' ? 'wallet'
    : notif.item_type === 'parcela' ? 'calendar'
      : notif.item_type === 'pagamento' ? 'receive'
        : notif.item_type === 'cliente' || notif.item_type === 'admin_signup' ? 'userPlus'
          : notif.item_type === 'documento' ? 'contracts'
            : 'bell';
  return <span aria-hidden="true" className={`${frame} flex items-center justify-center ${tone.bg}`}>
    <AppIcon name={iconName} size={24} />
  </span>;
};
