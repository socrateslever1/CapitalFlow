import React, { useState } from 'react';
import { Banknote, Bell, CalendarClock, CreditCard, FileText, UserPlus } from 'lucide-react';
import { BankLogo } from '../wallet/BankLogo';

type NotificationLike = {
  title: string;
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

/**
 * Imagem do aviso: foto do cliente quando houver, iniciais do cliente, logo do banco do cartão
 * ou um ícone do tipo do aviso. Nunca o sino genérico para avisos com origem conhecida.
 */
export const NotificationAvatar: React.FC<{ notif: NotificationLike }> = ({ notif }) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const meta = notif.metadata || {};
  const tone = toneClasses[notificationTone(notif)];
  const frame = `mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ${tone.ring}`;

  if (meta.avatar_url && !photoFailed) {
    return <img src={meta.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer"
      onError={() => setPhotoFailed(true)} className={`${frame} object-cover`} />;
  }
  if (meta.client_name) {
    return <span aria-hidden="true" className={`${frame} flex items-center justify-center text-[11px] font-black ${tone.bg} ${tone.text}`}>
      {initials(String(meta.client_name))}
    </span>;
  }
  if (notif.item_type === 'fatura' && meta.bank) {
    return <span className={`mt-0.5 shrink-0 rounded-lg ring-2 ${tone.ring}`}><BankLogo name={meta.bank} size="sm" /></span>;
  }
  const Icon = notif.item_type === 'fatura' ? CreditCard
    : notif.item_type === 'parcela' ? CalendarClock
      : notif.item_type === 'pagamento' ? Banknote
        : notif.item_type === 'cliente' || notif.item_type === 'admin_signup' ? UserPlus
          : notif.item_type === 'documento' ? FileText
            : Bell;
  return <span aria-hidden="true" className={`${frame} flex items-center justify-center ${tone.bg}`}>
    <Icon size={15} strokeWidth={2} className={tone.text} />
  </span>;
};
