import React, { useState } from 'react';
import { Copy, Check, RotateCw, Wifi } from 'lucide-react';
import { PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { copyCardFieldToClipboard, copyCardLastFourToClipboard } from '../../utils/cardClipboard';
import { BankLogo } from './BankLogo';
import { getBankVisual, getWalletCardVisual } from './walletPresentation';

export interface VirtualCreditCardProps {
  card: PersonalWalletCard;
  holderName?: string;
  className?: string;
  interactive?: boolean;
}

// Configurações visuais por emissor / banco
export function getCardTheme(issuer?: string | null) {
  const visual = getBankVisual(issuer);
  const defaults: Record<string, { brand: string; category: string }> = {
    nubank: { brand: 'Mastercard', category: 'Black / Platinum' },
    inter: { brand: 'Mastercard', category: 'Black' },
    itau: { brand: 'Visa', category: 'Personnalité' },
    santander: { brand: 'Mastercard', category: 'Select / Elite' },
    bradesco: { brand: 'Visa', category: 'Prime' },
    xp: { brand: 'Mastercard', category: 'Carbon Black' },
    c6: { brand: 'Mastercard', category: 'Carbon Black' },
    bb: { brand: 'Visa', category: 'Estilo' },
  };
  return {
    logoText: visual.name,
    ...(defaults[visual.key] || { brand: 'Mastercard', category: 'Platinum' }),
    shine: visual.key === 'bradesco'
      ? 'from-rose-200/20 via-transparent to-rose-900/20'
      : 'from-white/15 via-transparent to-white/5',
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

  const visual = getWalletCardVisual(card);
  const theme = getCardTheme(card.institution_key || card.issuer || card.nickname);

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
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={interactive ? isFlipped : undefined}
        aria-label={interactive ? (isFlipped ? 'Mostrar frente do cartão' : 'Mostrar verso do cartão') : undefined}
        onClick={() => interactive && setIsFlipped(!isFlipped)}
        onKeyDown={(event) => {
          if (!interactive || event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsFlipped((value) => !value);
          }
        }}
        className={`relative aspect-[1.586/1] w-full rounded-2xl p-5 sm:p-6 shadow-2xl transition-all duration-500 motion-reduce:transition-none transform cursor-pointer border border-white/10 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
        style={{
          background: visual.background,
          boxShadow: '0 20px 35px -10px rgba(0, 0, 0, 0.6), 0 0 20px 2px rgba(255, 255, 255, 0.05) inset',
        }}
      >
        {/* Camada de brilho / textura reflexiva */}
        <div className={`absolute inset-0 bg-gradient-to-tr ${theme.shine} pointer-events-none`} />
        <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full border border-white/10 bg-white/[0.025]" />
        <div className="absolute -right-20 -top-20 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        {!isFlipped ? (
          /* FRENTE DO CARTÃO */
          <div className="relative z-10 h-full flex flex-col justify-between text-white">
            {/* Topo: Emissor, Banco e Contactless */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BankLogo size="sm" name={card.institution_key || card.issuer || theme.logoText} alternateName={card.nickname}/>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 bg-black/25 px-2 py-0.5 rounded-full border border-white/15">
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
              <span className="text-[10px] font-bold tracking-widest uppercase text-white/75">
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
                      className="flex min-h-8 min-w-8 items-center justify-center p-1.5 rounded text-white/80 hover:text-white hover:bg-white/15 transition-colors"
                      disabled={!card.last_four}
                      aria-label="Copiar apenas os quatro últimos dígitos do cartão"
                      title="Copiar final do cartão"
                    >
                      {copied === 'number' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
              </div>

              {/* Linha inferior: Nome do Titular e Validade */}
              <div className="flex items-end justify-between mt-2 pt-1 border-t border-white/10">
                <button type="button" disabled={!card.cardholder_name} aria-label="Copiar titular do cartão" onClick={e => { void handleCopy('holder', e); }} className="min-h-8 min-w-0 pr-2 text-left disabled:opacity-75">
                  <span className="block text-[10px] uppercase tracking-wider text-white/80 font-semibold">
                    Titular · copiar
                  </span>
                  <span className="block font-mono text-xs sm:text-sm font-bold tracking-wider uppercase text-white truncate drop-shadow">
                    {effectiveHolder}
                  </span>
                </button>

                <button type="button" disabled={effectiveExp === '—'} aria-label="Copiar validade do cartão" onClick={e => { void handleCopy('expiry', e); }} className="min-h-8 text-right shrink-0 disabled:opacity-75">
                  <span className="block text-[10px] uppercase tracking-wider text-white/80 font-semibold">
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
                <div className="flex-1 h-8 bg-slate-200/95 rounded px-2 flex items-center justify-between text-slate-800 font-mono text-xs italic shadow-inner">
                  <span className="text-[10px] text-slate-600 font-sans not-italic">Assinatura autorizada</span>
                  <span className="font-bold tracking-wider">{effectiveHolder.slice(0, 15)}</span>
                </div>
                <div className="h-8 bg-white rounded px-2.5 flex items-center justify-center font-mono font-black text-slate-950 text-xs shadow-inner">
                  {effectiveCvv}
                </div>
              </div>
              <p className="text-[10px] text-white/80 leading-tight">
                Código de segurança (CVC/CVV) de 3 dígitos para transações online e verificações.
              </p>
            </div>

            {/* Rodapé com Informações de Suporte e Bandeira */}
            <div className="flex items-end justify-between pt-2 border-t border-white/10 text-[10px] text-white/80">
              <div>
                <p className="font-bold text-white">{card.issuer || 'Emissor Bancário'}</p>
                <p className="text-[10px] text-white/75">Fecha dia {card.closing_day || '—'} · Vence dia {card.due_day || '—'}</p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-white/75 block">Limite Total</span>
                <strong className="text-xs font-bold text-white">{formatMoney(card.credit_limit)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Indicador interativo para virar o cartão */}
        {interactive && (
          <div className="absolute bottom-2 right-2 z-20 opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-white bg-black/50 px-2 py-0.5 rounded-full pointer-events-none">
            <RotateCw size={10} />
            <span>Toque para virar</span>
          </div>
        )}
      </div>
    </div>
  );
};
