import React, { useMemo, useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { supabase } from "../../lib/supabase";
import { CheckCircle2, Copy, RefreshCw, AlertCircle } from "lucide-react";
import { fetchChargeById } from "../../services/pix.service";

type PixDepositModalProps = {
  isOpen: boolean;
  onClose: () => void;
  // opcional: se você quiser amarrar no futuro com a fonte (carteira)
  sourceId?: string | null;
  onSuccess?: () => void;
};

export default function PixDepositModal({ isOpen, onClose, sourceId, onSuccess }: PixDepositModalProps) {
  const [amount, setAmount] = useState<string>("10.00");
  const [payerName, setPayerName] = useState<string>("Teste PIX");
  const [payerEmail, setPayerEmail] = useState<string>("teste@pix.com");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [result, setResult] = useState<null | {
    charge_id: string;
    provider_payment_id: string;
    status: string;
    provider_status: string;
    qr_code: string;
    qr_code_base64?: string | null;
  }>(null);

  const [isPaid, setIsPaid] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Polling para verificar status do pagamento
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (result && result.status !== 'paid' && !isPaid) {
      setIsPolling(true);
      interval = setInterval(async () => {
        try {
          const { data, error } = await fetchChargeById(result.charge_id);
          if (error) throw error;

          if (data && data.status === 'paid') {
            setIsPaid(true);
            setIsPolling(false);
            if (onSuccess) onSuccess();
            clearInterval(interval);
          }
        } catch (e) {
          console.error("Erro ao verificar status do PIX:", e);
        }
      }, 5000); // Verifica a cada 5 segundos
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [result, isPaid]);

  const amountNumber = useMemo(() => {
    const normalized = (amount || "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const qrImgSrc = useMemo(() => {
    if (!result?.qr_code_base64) return null;
    // Se já vier com prefixo, usa direto. Se vier "puro", adiciona.
    if (result.qr_code_base64.startsWith("data:image/")) return result.qr_code_base64;
    return `data:image/png;base64,${result.qr_code_base64}`;
  }, [result?.qr_code_base64]);

  if (!isOpen) return null;

  async function handleCreatePix() {
    setErr(null);
    setResult(null);

    if (amountNumber <= 0) {
      setErr("Informe um valor maior que zero.");
      return;
    }

    setLoading(true);
    try {
      // CHAMA SUA EDGE FUNCTION (a que você já testou no AI Studio)
      const { data, error } = await supabase.functions.invoke("mp-create-pix", {
        body: {
          amount: amountNumber,
          payer_name: payerName,
          payer_email: payerEmail,
          source_id: sourceId ?? null,
        },
      });

      if (error) throw error;
      if (!data?.ok) {
        throw new Error(data?.error || "Falha ao criar PIX.");
      }

      setResult({
        charge_id: data.charge_id,
        provider_payment_id: data.provider_payment_id,
        status: data.status,
        provider_status: data.provider_status,
        qr_code: data.qr_code,
        qr_code_base64: data.qr_code_base64 ?? null,
      });
    } catch (e: any) {
      setErr(e?.message || "Erro desconhecido ao criar PIX.");
    } finally {
      setLoading(false);
    }
  }

  function copyText(txt: string) {
    try {
      navigator.clipboard.writeText(txt);
    } catch {
      // fallback silencioso
    }
  }

  return (
    <Modal onClose={onClose} title="Depósito via PIX (Mercado Pago)">
      <div className="space-y-4">
        {isPaid && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4 animate-in zoom-in">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={48} className="text-emerald-500" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Pagamento Confirmado!</h3>
              <p className="text-slate-400 text-sm">O saldo foi adicionado à sua carteira com sucesso.</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-full uppercase transition-all shadow-lg mt-4"
            >
              Concluir
            </button>
          </div>
        )}

        {!isPaid && !result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Valor</label>
                <input
                  type="text"
                  value={amount || ''}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-950 p-3 rounded-full text-white font-bold outline-none border border-slate-800 focus:border-blue-500 transition-colors"
                  placeholder="10.00"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Nome</label>
                <input
                  type="text"
                  value={payerName || ''}
                  onChange={(e) => setPayerName(e.target.value)}
                  className="w-full bg-slate-950 p-3 rounded-full text-white font-bold outline-none border border-slate-800 focus:border-blue-500 transition-colors"
                  placeholder="Cliente"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">E-mail</label>
                <input
                  type="email"
                  value={payerEmail || ''}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  className="w-full bg-slate-950 p-3 rounded-full text-white font-bold outline-none border border-slate-800 focus:border-blue-500 transition-colors"
                  placeholder="cliente@email.com"
                />
              </div>
            </div>

            {err && (
              <div className="bg-red-900/20 border border-red-500/30 p-3 rounded-full">
                <p className="text-[11px] text-red-200 font-bold">{err}</p>
              </div>
            )}

            <button
              onClick={handleCreatePix}
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black rounded-full uppercase transition-all shadow-lg"
            >
              {loading ? "Gerando PIX..." : "Gerar PIX"}
            </button>
          </>
        )}

        {result && !isPaid && (
          <>
            <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-full flex items-center justify-between">
              <div>
                <p className="text-[11px] text-blue-200 font-bold">
                  Aguardando pagamento...
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  ID: <span className="font-mono">{result.provider_payment_id}</span>
                </p>
              </div>
              {isPolling && (
                <RefreshCw size={16} className="text-blue-400 animate-spin" />
              )}
            </div>

            {qrImgSrc && (
              <div className="flex justify-center p-4 bg-white rounded-full">
                <img
                  src={qrImgSrc}
                  alt="QR Code PIX"
                  className="max-w-[240px] w-full"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Código Copia e Cola</label>
                <button 
                  onClick={() => copyText(result.qr_code)}
                  className="text-[10px] text-blue-400 font-bold flex items-center gap-1 hover:text-blue-300 transition-colors"
                >
                  <Copy size={10} /> Copiar
                </button>
              </div>
              <textarea
                value={result.qr_code || ''}
                readOnly
                className="w-full bg-slate-950 p-3 rounded-full text-white text-[10px] font-mono outline-none border border-slate-800 focus:border-blue-500/50 transition-colors"
                rows={4}
              />
              
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setResult(null);
                    setErr(null);
                    setIsPaid(false);
                  }}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-full uppercase transition-all border border-slate-800 text-xs"
                >
                  Cancelar e Gerar Novo
                </button>
                
                <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 italic">
                  <AlertCircle size={12} />
                  O saldo será atualizado automaticamente após a confirmação.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}