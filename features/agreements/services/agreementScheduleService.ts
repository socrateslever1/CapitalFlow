import { supabase } from '../../../lib/supabase';

type ScheduleFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'SEMANAL' | 'QUINZENAL' | 'MENSAL';

const normalizePeriodicity = (frequency: ScheduleFrequency | string) => {
  const value = String(frequency || '').trim().toUpperCase();
  if (value === 'WEEKLY' || value === 'SEMANAL') return 'SEMANAL';
  if (value === 'BIWEEKLY' || value === 'QUINZENAL') return 'QUINZENAL';
  return 'MENSAL';
};

export const agreementScheduleService = {
  async updateSchedule(
    agreementId: string,
    frequency: ScheduleFrequency | string,
    firstDueDate: string,
    installmentValue: number
  ) {
    const normalizedValue = Number(installmentValue) || 0;
    if (!agreementId) throw new Error('ID do acordo não fornecido.');
    if (!firstDueDate) throw new Error('Informe a primeira data de vencimento.');
    if (normalizedValue <= 0) throw new Error('O valor da parcela deve ser maior que zero.');

    const { data, error } = await supabase.rpc('update_agreement_schedule_from_balance', {
      p_agreement_id: agreementId,
      p_periodicity: normalizePeriodicity(frequency),
      p_first_due_date: String(firstDueDate).slice(0, 10),
      p_installment_value: normalizedValue,
    });

    if (error) {
      throw new Error(`Falha ao recalcular o cronograma: ${error.message}`);
    }

    return data;
  },
};
