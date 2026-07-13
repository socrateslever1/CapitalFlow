
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
    holderCpf: '',
    holderCep: '',
    installments: '1'
  });

  const amountToPay = Number(installment?.principal_remaining || installment?.principalRemaining || 0) +
                    Number(installment?.interest_remaining || installment?.interestRemaining || 0);

  // Calcula o valor final cobrando as taxas do Asaas (taxa fixa de R$ 0.49 + 2.99% base + 1.99% por parcela adicional)
  const calculateCardValue = (baseAmount: number, installments: number) => {
    const fixedFee = 0.49;
    let percentageRate = 0.0299; // 2.99% base do Asaas
    if (installments > 1) {
      percentageRate += 0.0199 * (installments - 1); // Taxa de antecipação/parcelamento
    }
    const finalAmount = (baseAmount + fixedFee) / (1 - percentageRate);
    return Math.round(finalAmount * 100) / 100;
  };

  const maxInstallments = Math.min(12, Math.floor(amountToPay / 5)) || 1;
  const installmentOptions = [];
  for (let i = 1; i <= maxInstallments; i++) {
    const finalAmountWithFee = calculateCardValue(amountToPay, i);
    const installmentValue = finalAmountWithFee / i;
    installmentOptions.push({
      value: i,
      label: i === 1
        ? `À vista - R$ ${finalAmountWithFee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : `${i}x de R$ ${installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (total R$ ${finalAmountWithFee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
    });
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'number') {
      const digitsOnly = value.replace(/\D/g, '').substring(0, 16);
      const formatted = digitsOnly.match(/.{1,4}/g)?.join(' ') || digitsOnly;
      setFormData(prev => ({ ...prev, number: formatted }));
    } else if (name === 'expiry') {
      const digitsOnly = value.replace(/\D/g, '').substring(0, 4);
      let formatted = digitsOnly;
      if (digitsOnly.length > 2) {
        formatted = `${digitsOnly.substring(0, 2)}/${digitsOnly.substring(2, 4)}`;
      }
      setFormData(prev => ({ ...prev, expiry: formatted }));
    } else if (name === 'ccv') {
      const digitsOnly = value.replace(/\D/g, '').substring(0, 4);
      setFormData(prev => ({ ...prev, ccv: digitsOnly }));
    } else if (name === 'holderName') {
      setFormData(prev => ({ ...prev, holderName: value.toUpperCase() }));
    } else if (name === 'holderCpf') {
      const digits = value.replace(/\D/g, '').substring(0, 14);
      let formatted = digits;
      if (digits.length > 11) {
        formatted = digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
      } else if (digits.length > 9) {
        formatted = digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
      } else if (digits.length > 6) {
        formatted = digits.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
      } else if (digits.length > 3) {
        formatted = digits.replace(/^(\d{3})(\d{3})$/, "$1.$2");
      }
      setFormData(prev => ({ ...prev, holderCpf: formatted }));
    } else if (name === 'holderCep') {
      const digits = value.replace(/\D/g, '').substring(0, 8);
      let formatted = digits;
      if (digits.length > 5) {
        formatted = `${digits.substring(0, 5)}-${digits.substring(5, 8)}`;
      }
      setFormData(prev => ({ ...prev, holderCep: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    try {
      // Normalização robusta de data de expiração (MM/AA, MM/AAAA ou formatos compactos como MMAA/MMAAAA)
      const cleanExpiry = formData.expiry.replace(/[^\d/]/g, '').trim();
      let expiryMonth = '';
      let expiryYear = '';

      if (cleanExpiry.includes('/')) {
        const parts = cleanExpiry.split('/');
        expiryMonth = (parts[0] || '').trim();
        expiryYear = (parts[1] || '').trim();
      } else if (cleanExpiry.length === 4) {
        expiryMonth = cleanExpiry.substring(0, 2);
        expiryYear = cleanExpiry.substring(2, 4);
      } else if (cleanExpiry.length === 6) {
        expiryMonth = cleanExpiry.substring(0, 2);
        expiryYear = cleanExpiry.substring(2, 6);
      }

      if (expiryYear.length === 2) {
        expiryYear = '20' + expiryYear;
      }

      if (!expiryMonth || !expiryYear || expiryMonth.length !== 2 || expiryYear.length !== 4) {
        throw new Error('Data de validade inválida. Por favor, use o formato MM/AA.');
      }

      const selectedInstallments = Number(formData.installments);
      const amountWithFees = calculateCardValue(amountToPay, selectedInstallments);

      const payload: AsaasPaymentInput = {
        loan_id: loan.id,
        installment_id: installment.id,
        amount: amountWithFees,
        payment_method: 'CREDIT_CARD',
        installmentCount: selectedInstallments,
        credit_card: {
          holderName: formData.holderName,
          number: formData.number.replace(/\s/g, ''),
          expiryMonth: expiryMonth,
          expiryYear: expiryYear,
          ccv: formData.ccv,
          holderCpf: formData.holderCpf.replace(/\D/g, ''),
          holderCep: formData.holderCep.replace(/\D/g, '')
        },
        payer: {
          name: clientData.name,
          email: clientData.email || 'cliente@capitalflow.com.br',
          cpfCnpj: clientData.doc || '',
          phone: clientData.phone || ''
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
    <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 my-auto">

        {/* Header */}
        <div className="bg-gradient-to-br from-amber-600 to-amber-700 p-8 text-white relative">
          <div className="absolute top-4 right-4 bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/30 transition-all" onClick={onClose}>
             <ChevronRight className="rotate-90" size={16} />
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 p-3 rounded-lg backdrop-blur-md">
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
            <div className="bg-red-900/10 border border-red-900/30 p-4 rounded-lg flex gap-3 text-red-500 animate-in fade-in slide-in-from-top-2">
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
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-mono tracking-widest font-bold placeholder:text-slate-700"
                  placeholder="0000 0000 0000 0000"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700">
                  <CreditCard size={20} />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Opções de Parcelamento</label>
              <select
                name="installments"
                value={formData.installments}
                onChange={handleInputChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold"
              >
                {installmentOptions.map(option => (
                  <option key={option.value} value={option.value} className="bg-slate-900 text-white font-bold">
                    {option.label}
                  </option>
                ))}
              </select>
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700 text-center"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700 text-center"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700">
                    <Lock size={16} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">CPF do Titular</label>
                <input
                  required
                  name="holderCpf"
                  value={formData.holderCpf}
                  onChange={handleInputChange}
                  placeholder="000.000.000-00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700 text-center"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">CEP de Cobrança</label>
                <input
                  required
                  name="holderCep"
                  value={formData.holderCep}
                  onChange={handleInputChange}
                  placeholder="00000-000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-amber-500 transition-all font-bold placeholder:text-slate-700 text-center"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex items-center gap-3">
             <ShieldCheck size={20} className="text-emerald-500" />
             <div className="text-[9px] text-slate-400 font-medium leading-tight">
               Seus dados são criptografados e processados com segurança pelo <span className="text-white font-bold">Asaas</span>. Não armazenamos os dados do seu cartão.
             </div>
          </div>

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 text-white font-black uppercase text-xs tracking-widest py-5 rounded-lg transition-all shadow-xl shadow-amber-900/20 flex items-center justify-center gap-3"
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
