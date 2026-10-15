import { Agreement } from "../../../types";

const money = (value: unknown): number => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};

const installmentAmount = (inst: any): number =>
  Math.max(0, money(inst?.amount ?? inst?.valor));

const installmentPaid = (inst: any): number =>
  Math.max(0, money(inst?.paidAmount ?? inst?.paid_amount ?? inst?.valor_pago));

const dateOnly = (value: unknown): string =>
  String(value || "").slice(0, 10);

export interface AgreementScheduleProgress {
  paidTotal: number;
  outstandingBalance: number;
  logicalInstallmentsCount: number;
  paidEquivalentInstallments: number;
  displayNumberById: Record<string, number>;
}

export const resolveAgreementScheduleProgress = (
  agreement: Agreement | any
): AgreementScheduleProgress => {
  const installments = Array.isArray(agreement?.installments)
    ? agreement.installments.filter(Boolean)
    : [];

  const paidTotal = money(installments.reduce((sum: number, inst: any) => {
    return sum + Math.min(installmentAmount(inst), installmentPaid(inst));
  }, 0));

  const outstandingBalance = money(installments.reduce((sum: number, inst: any) => {
    return sum + Math.max(0, installmentAmount(inst) - installmentPaid(inst));
  }, 0));

  const fallbackValue = installments.find((inst: any) =>
    installmentAmount(inst) - installmentPaid(inst) > 0.05
  );
  const planInstallmentValue = money(
    agreement?.installmentValue ??
    agreement?.installment_value ??
    installmentAmount(fallbackValue)
  );

  const negotiatedTotal = money(
    agreement?.negotiatedTotal ??
    agreement?.total_negociado ??
    paidTotal + outstandingBalance
  );

  const logicalInstallmentsCount = planInstallmentValue > 0.005 && negotiatedTotal > 0.005
    ? Math.max(1, Math.ceil((negotiatedTotal - 0.000001) / planInstallmentValue))
    : Math.max(0, Number(agreement?.installmentsCount || agreement?.num_parcelas || installments.length) || 0);

  const paidEquivalentInstallments = planInstallmentValue > 0.005
    ? Math.min(
        logicalInstallmentsCount,
        Math.max(0, Math.floor((paidTotal + 0.000001) / planInstallmentValue))
      )
    : installments.filter((inst: any) => installmentPaid(inst) + 0.05 >= installmentAmount(inst)).length;

  const firstDueDate = dateOnly(agreement?.firstDueDate ?? agreement?.first_due_date);
  const currentScheduleRows = firstDueDate
    ? installments
        .filter((inst: any) => dateOnly(inst?.dueDate ?? inst?.due_date ?? inst?.data_vencimento) >= firstDueDate)
        .sort((a: any, b: any) => {
          const aDate = dateOnly(a?.dueDate ?? a?.due_date ?? a?.data_vencimento);
          const bDate = dateOnly(b?.dueDate ?? b?.due_date ?? b?.data_vencimento);
          return aDate.localeCompare(bDate) || (Number(a?.number || a?.numero || 0) - Number(b?.number || b?.numero || 0));
        })
    : [];

  const currentIds = new Set(currentScheduleRows.map((inst: any) => String(inst?.id || "")));
  const historicalPaidTotal = planInstallmentValue > 0.005
    ? money(installments.reduce((sum: number, inst: any) => {
        if (currentIds.has(String(inst?.id || ""))) return sum;
        return sum + Math.min(installmentAmount(inst), installmentPaid(inst));
      }, 0))
    : 0;

  const scheduleOffset = planInstallmentValue > 0.005
    ? Math.max(0, Math.floor((historicalPaidTotal + 0.000001) / planInstallmentValue))
    : 0;

  const displayNumberById: Record<string, number> = {};
  installments.forEach((inst: any) => {
    const id = String(inst?.id || "");
    if (!id) return;
    displayNumberById[id] = Number(inst?.number ?? inst?.numero ?? 0) || 0;
  });

  currentScheduleRows.forEach((inst: any, index: number) => {
    const id = String(inst?.id || "");
    if (!id) return;
    displayNumberById[id] = Math.min(
      Math.max(1, logicalInstallmentsCount || scheduleOffset + index + 1),
      scheduleOffset + index + 1
    );
  });

  return {
    paidTotal,
    outstandingBalance,
    logicalInstallmentsCount,
    paidEquivalentInstallments,
    displayNumberById,
  };
};
