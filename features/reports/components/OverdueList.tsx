import React, { useEffect, useState } from 'react';
// import { contractService } from '@/features/capital-flow/services/contractService';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const OverdueList = () => {
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false); // Changed to false for now

  const fetchOverdue = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    try {
      // const data = await contractService.getOverdueInstallments(user.id);
      // setInstallments(data || []);
      setInstallments([]);
    } catch (e) {
      console.error("Erro ao carregar atrasados", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverdue();
  }, []);

  if (loading) return <div className="p-4 text-slate-500 font-mono text-xs">Carregando...</div>;

  return (
    <Card className="overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50/50">
        <h2 className="text-lg font-semibold text-slate-800">Parcelas Atrasadas</h2>
        <Button variant="secondary" onClick={fetchOverdue}>Atualizar</Button>
      </div>
      <div className="grid grid-cols-4 p-3 border-b border-slate-200 bg-slate-50/50">
        <span className="col-header">ID</span>
        <span className="col-header">Cliente</span>
        <span className="col-header">Vencimento</span>
        <span className="col-header text-right">Valor</span>
      </div>
      {installments.map((inst) => (
        <div key={inst.id} className="data-row grid grid-cols-4 p-3 border-b border-slate-200 hover:bg-slate-900 hover:text-slate-100 transition-colors">
          <span className="data-value text-xs">{inst.numero_parcela}</span>
          <span className="text-sm font-medium truncate">{inst.contratos?.debtor_name || 'N/A'}</span>
          <span className="data-value text-xs">{new Date(inst.data_vencimento).toLocaleDateString()}</span>
          <span className="data-value text-xs text-right font-bold">R$ {inst.valor_parcela.toFixed(2)}</span>
        </div>
      ))}
    </Card>
  );
};
