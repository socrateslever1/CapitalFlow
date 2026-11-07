import React, { useState } from 'react';
import { Copy, Check, RotateCw, Wifi } from 'lucide-react';
import { PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { copyCardFieldToClipboard, copyCardLastFourToClipboard } from '../../utils/cardClipboard';
import { resolveBankLogo } from '../../utils/bankLogoRegistry';

export interface VirtualCreditCardProps {
  card: PersonalWalletCard;
  holderName?: string;
  className?: string;
  interactive?: boolean;
}

// Configurações visuais por emissor / banco
export function getCardTheme(nickname: string, issuer?: string | null) {
  const text = `${nickname} ${issuer || ''}`.toLowerCase();

  if (text.includes('nu') || text.includes('nubank') || text.includes('roxinho') || text.includes('ultravioleta')) {
    return {
      gradient: 'from-[#501382] via-[#61199c] to-[#2c0948]',
      accentColor: '#a855f7',
      textColor: 'text-purple-100',
      logoText: 'nu',
      brand: 'Mastercard',
      category: 'Black / Platinum',
      shine: 'from-purple-400/20 via-transparent to-pink-500/10',
      stripeColor: 'bg-purple-950',
    };
  }
  if (text.includes('inter')) {
    return {
      gradient: 'from-[#ff6f00] via-[#ea580c] to-[#9a3412]',
      accentColor: '#f97316',
      textColor: 'text-orange-100',
      logoText: 'inter',
      brand: 'Mastercard',
      category: 'Black',
      shine: 'from-orange-300/30 via-transparent to-amber-500/15',
      stripeColor: 'bg-orange-950',
    };
  }
  if (text.includes('itau') || text.includes('itaú')) {
    return {
      gradient: 'from-[#0b2447] via-[#19376d] to-[#041226]',
      accentColor: '#38bdf8',
      textColor: 'text-blue-100',
      logoText: 'Itaú',
      brand: 'Visa',
      category: 'Personalité',
      shine: 'from-cyan-400/20 via-transparent to-blue-500/20',
      stripeColor: 'bg-slate-950',
    };
  }
  if (text.includes('santander')) {
    return {
      gradient: 'from-[#b91c1c] via-[#991b1b] to-[#450a0a]',
      accentColor: '#f87171',
      textColor: 'text-red-100',
      logoText: 'Santander',
      brand: 'Mastercard',
      category: 'Select / Elite',
      shine: 'from-red-300/20 via-transparent to-rose-500/20',
      stripeColor: 'bg-red-950',
    };
  }
  if (text.includes('bradesco')) {
    return {
      gradient: 'from-[#9f1239] via-[#881337] to-[#4c0519]',
      accentColor: '#fb7185',
      textColor: 'text-rose-100',
      logoText: 'bradesco',
      brand: 'Visa',
      category: 'Prime',
      shine: 'from-rose-300/20 via-transparent to-red-500/20',
      stripeColor: 'bg-rose-950',
    };
  }
  if (text.includes('xp') || text.includes('carbon') || text.includes('black') || text.includes('c6')) {
    return {
      gradient: 'from-[#18181b] via-[#09090b] to-[#000000]',
      accentColor: '#fbbf24',
      textColor: 'text-amber-100',
      logoText: text.includes('c6') ? 'C6 BANK' : 'XP',
      brand: 'Mastercard',
      category: 'Carbon Black',
      shine: 'from-amber-400/25 via-transparent to-yellow-600/15',
      stripeColor: 'bg-black',
    };
  }
  if (text.includes('bb') || text.includes('brasil')) {
    return {
      gradient: 'from-[#1e3a8a] via-[#172554] to-[#0f172a]',
      accentColor: '#facc15',
      textColor: 'text-yellow-100',
      logoText: 'BB',
      brand: 'Visa',
      category: 'Estilo',
      shine: 'from-yellow-400/20 via-transparent to-blue-400/20',
      stripeColor: 'bg-slate-950',
    };
  }

  // Padrão escuro sofisticado
  return {
    gradient: 'from-[#1e293b] via-[#0f172a] to-[#020617]',
    accentColor: '#60a5fa',
    textColor: 'text-slate-100',
    logoText: issuer || 'BANCO',
    brand: 'Mastercard',
    category: 'Platinum',
    shine: 'from-blue-400/20 via-transparent to-indigo-500/15',
    stripeColor: 'bg-slate-950',
  };
}

export const VirtualCreditCard: React.FC<VirtualCreditCardProps> = ({
  card,
  holderName,
  className = '',
  interactive = true,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const theme = getCardTheme(card.nickname, card.issuer);

  const effectiveHolder = holderName || card.cardholder_name || card.nickname.toUpperCase();
  const rawNumber = card.last_four ? `•••• •••• •••• ${card.last_four}` : '•••• •••• •••• ----';
  const effectiveExp = card.expiry_month && card.expiry_year
    ? `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year).slice(-2)}`
    : '—';
  const effectiveCvv = '•••';
  const effectiveBrand = card.brand || theme.brand;
  const formattedNumber = rawNumber;

  const handleCopy = async (type: 'number' | 'holder' | 'expiry', e: React.MouseEvent) => {
    e.stopPropagation();
    const result = type === 'number'
      ? await copyCardLastFourToClipboard(card.last_four)
      : type === 'holder'
        ? await copyCardFieldToClipboard('Titular', card.cardholder_name || '')
        : await copyCardFieldToClipboard('Validade', effectiveExp === '—' ? '' : effectiveExp);
    if (result.success) {
      setCopied(type);
      window.setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <div className={`w-full max-w-sm mx-auto select-none ${className}`}>
      {/* Container do Cartão com Aspect Ratio padrão ISO 7810 (1.586 : 1) */}
      <div
        onClick={() => interactive && setIsFlipped(!isFlipped)}
        className={`relative aspect-[1.586/1] w-full rounded-2xl p-5 sm:p-6 shadow-2xl transition-all duration-500 transform cursor-pointer border border-white/10 overflow-hidden bg-gradient-to-br ${theme.gradient}`}
        style={{
          boxShadow: '0 20px 35px -10px rgba(0, 0, 0, 0.6), 0 0 20px 2px rgba(255, 255, 255, 0.05) inset',
        }}
      >
        {/* Camada de brilho / textura reflexiva */}
        <div className={`absolute inset-0 bg-gradient-to-tr ${theme.shine} pointer-events-none`} />
        <div className="absolute -right-20 -top-20 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        {!isFlipped ? (
          /* FRENTE DO CARTÃO */
          <div className="relative z-10 h-full flex flex-col justify-between text-white">
            {/* Topo: Emissor, Banco e Contactless */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {resolveBankLogo(card.issuer, card.nickname) ? (
                  <img src={resolveBankLogo(card.issuer, card.nickname)!} alt={`Logo ${card.issuer || card.nickname}`} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                ) : (
                  <span className="font-extrabold text-sm sm:text-base tracking-wider uppercase text-white/95">
                    {card.issuer || theme.logoText}
                  </span>
                )}
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/60 bg-black/20 px-2 py-0.5 rounded-full border border-white/10">
                  {card.nickname}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <Wifi size={18} className="text-white/80 rotate-90 shrink-0" />
                {effectiveBrand.toLowerCase().includes('visa') ? (
                  <span className="font-black italic text-lg sm:text-xl tracking-tighter text-white">
                    VISA
                  </span>
                ) : (
                  /* Logo Oficial Mastercard (dois círculos entrelaçados) */
                  <div className="flex items-center -space-x-2 shrink-0">
                    <div className="w-6 h-6 rounded-full bg-[#eb001b] shadow-sm opacity-95" />
                    <div className="w-6 h-6 rounded-full bg-[#f79e1b] shadow-sm opacity-90" />
                  </div>
                )}
              </div>
            </div>

            {/* Centro: Chip EMV Metálico Dourado */}
            <div className="flex items-center gap-3 my-auto">
              <div
                className="w-12 h-9 rounded-lg border border-amber-300/50 shadow-inner relative overflow-hidden flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #fef08a 0%, #facc15 40%, #ca8a04 100%)',
                  boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.3)',
                }}
              >
                {/* Linhas gravadas no chip */}
                <div className="absolute inset-x-0 top-2.5 h-[1px] bg-amber-900/40" />
                <div className="absolute inset-x-0 bottom-2.5 h-[1px] bg-amber-900/40" />
                <div className="absolute inset-y-0 left-3.5 w-[1px] bg-amber-900/40" />
                <div className="absolute inset-y-0 right-3.5 w-[1px] bg-amber-900/40" />
                <div className="w-4 h-4 rounded-sm border border-amber-900/30" />
              </div>

              {/* Ícone sutil contactless ou categoria */}
              <span className="text-[10px] font-bold tracking-widest uppercase text-white/50">
                {theme.category}
              </span>
            </div>

            {/* Número do Cartão com Tipografia em Relevo (Embossed OCR) */}
            <div>
              <div className="flex items-center justify-between">
                <p
                  className="font-mono text-base sm:text-lg font-bold tracking-[0.2em] text-white/95 drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.4)' }}
                >
                  {formattedNumber}
                </p>

                {interactive && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => { void handleCopy('number', e); }}
                      className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                      disabled={!card.last_four}
                      aria-label="Copiar apenas os quatro últimos dígitos do cartão"
                      title="Copiar final do cartão"
                    >
                      {copied === 'number' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                )}
              </div>

              {/* Linha inferior: Nome do Titular e Validade */}
              <div className="flex items-end justify-between mt-2 pt-1 border-t border-white/10">
                <button type="button" disabled={!card.cardholder_name} aria-label="Copiar titular do cartão" onClick={e => { void handleCopy('holder', e); }} className="min-w-0 pr-2 text-left disabled:opacity-75">
                  <span className="block text-[8px] uppercase tracking-wider text-white/50 font-semibold">
                    Titular · copiar
                  </span>
                  <span className="block font-mono text-xs sm:text-sm font-bold tracking-wider uppercase text-white truncate drop-shadow">
                    {effectiveHolder}
                  </span>
                </button>

                <button type="button" disabled={effectiveExp === '—'} aria-label="Copiar validade do cartão" onClick={e => { void handleCopy('expiry', e); }} className="text-right shrink-0 disabled:opacity-75">
                  <span className="block text-[8px] uppercase tracking-wider text-white/50 font-semibold">
                    Validade · copiar
                  </span>
                  <span className="block font-mono text-xs sm:text-sm font-bold tracking-wider text-white drop-shadow">
                    {effectiveExp}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* VERSO DO CARTÃO */
          <div className="relative z-10 h-full flex flex-col justify-between text-white">
            {/* Faixa Magnética Preta */}
            <div className="-mx-5 sm:-mx-6 -mt-2 h-9 bg-black/90 shadow-inner border-y border-white/10" />

            {/* Faixa de Assinatura e CVV */}
            <div className="my-auto space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-8 bg-slate-200/90 rounded px-2 flex items-center justify-between text-slate-800 font-mono text-xs italic shadow-inner">
                  <span className="text-[9px] text-slate-500 font-sans not-italic">Assinatura autorizada</span>
                  <span className="font-bold tracking-wider">{effectiveHolder.slice(0, 15)}</span>
                </div>
                <div className="h-8 bg-white rounded px-2.5 flex items-center justify-center font-mono font-black text-slate-950 text-xs shadow-inner">
                  {effectiveCvv}
                </div>
              </div>
              <p className="text-[8px] text-white/60 leading-tight">
                Código de segurança (CVC/CVV) de 3 dígitos para transações online e verificações.
              </p>
            </div>

            {/* Rodapé com Informações de Suporte e Bandeira */}
            <div className="flex items-end justify-between pt-2 border-t border-white/10 text-[9px] text-white/70">
              <div>
                <p className="font-bold text-white">{card.issuer || 'Emissor Bancário'}</p>
                <p className="text-[8px] text-white/50">Fecha dia {card.closing_day || '—'} · Vence dia {card.due_day || '—'}</p>
              </div>

              <div className="text-right">
                <span className="text-[8px] text-white/50 block">Limite Total</span>
                <strong className="text-xs font-bold text-white">{formatMoney(card.credit_limit)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Indicador interativo para virar o cartão */}
        {interactive && (
          <div className="absolute bottom-2 right-2 z-20 opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1 text-[8px] text-white bg-black/40 px-2 py-0.5 rounded-full pointer-events-none">
            <RotateCw size={10} />
            <span>Toque para virar</span>
          </div>
        )}
      </div>
    </div>
  );
};
