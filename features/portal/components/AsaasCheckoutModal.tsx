
import React, { useState } from 'react';
import { CreditCard, Lock, ShieldCheck, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { asaasService, AsaasPaymentInput } from '../../../services/asaas.service';

interface AsaasCheckoutModalProps {
  loan: any;
  installment: any;
  clientData: any;
  portalToken: string;
  portalCode: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AsaasCheckoutModal: React.FC<AsaasCheckoutModalProps> = ({
  loan,
  installment,
  clientData,
  portalToken,
  portalCode,
  onClose,
  onSuccess
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    holderName: '',
    number: '',
    expiry: '',
    ccv: '',
  });

  const amountToPay = Number(installment?.principal_remaining || installment?.principalRemaining || 0) + 
                    Number(installment?.interest_remaining || installment?.interestRemaining || 0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    try {
      const [expiryMonth, expiryYear] = formData.expiry.split('/');
      
      const payload: AsaasPaymentInput = {
        loan_id: loan.id,
        installment_id: installment.id,
        amount: amountToPay,
        payment_method: 'CREDIT_CARD',
        credit_card: {
          holderName: formData.holderName,
          number: formData.number.replace(/\s/g, ''),
          expiryMonth: expiryMonth.trim(),
          expiryYear: '20' + expiryYear.trim(),
          ccv: formData.ccv
        },
        payer: {
          name: clientData.name,
          email: clientData.email || 'cliente@capitalflow.com.br',
          cpfCnpj: clientData.doc || ''
        }
      };

      await asaasService.createPaymentPortal(portalToken, portalCode, payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Falha ao processar pagamento');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-600 to-amber-700 p-8 text-white relative">
          <div className="absolute top-4 right-4 bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/30 transition-all" onClick={onClose}>
             <ChevronRight className="rotate-90" size={16} />
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
              <CreditCard size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter">Pagamento Seguro</h2>
              <p className="text-[10px] uppercase font-bold text-amber-100 opacity-80 letter-spacing-widest">Checkout Transparente</p>
            </div>
          </div>
          <div className="flex justify-between items-end mt-6">
             <div className="text-[10px] uppercase font-black opacity-60">Total a Pagar</div>
             <div className="text-3xl font-black">R$ {amountToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          
          {error && (
            <div className="bg-red-900/10 border border-red-900/30 p-4 rounded-2xl flex gap-3 text-red-500 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="shrink-0" size={18} />
              <p className="text-[10px] font-bold leading-tight">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Nome no Cartão</label>
              <input 
                required
                name="holderName"
                value={formData.holderName}
                onChange={handleInputChange}
                autoComplete="cc-name"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700"
                placeholder="NOME COMO NO CARTÃO"
              />
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Número do Cartão</label>
              <div className="relative">
                <input 
                  required
                  name="number"
                  value={formData.number}
                  onChange={handleInputChange}
                  autoComplete="cc-number"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-mono tracking-widest font-bold placeholder:text-slate-700"
                  placeholder="0000 0000 0000 0000"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700">
                  <CreditCard size={20} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Validade</label>
                <input 
                  required
                  name="expiry"
                  value={formData.expiry}
                  onChange={handleInputChange}
                  placeholder="MM/AA"
                  autoComplete="cc-exp"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700 text-center"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">CVV</label>
                <div className="relative">
                  <input 
                    required
                    name="ccv"
                    type="password"
                    maxLength={4}
                    value={formData.ccv}
                    onChange={handleInputChange}
                    placeholder="***"
                    autoComplete="cc-csc"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700 text-center"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700">
                    <Lock size={16} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center gap-3">
             <ShieldCheck size={20} className="text-emerald-500" />
             <div className="text-[9px] text-slate-400 font-medium leading-tight">
               Seus dados são criptografados e processados com segurança pelo <span className="text-white font-bold">Asaas</span>. Não armazenamos os dados do seu cartão.
             </div>
          </div>

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 text-white font-black uppercase text-xs tracking-widest py-5 rounded-2xl transition-all shadow-xl shadow-amber-900/20 flex items-center justify-center gap-3"
          >
            {isProcessing ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Processando...
              </>
            ) : (
              <>
                Finalizar Pagamento <ChevronRight size={18} />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
