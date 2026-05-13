
import { addDaysUTC, parseDateOnlyUTC } from "../../../utils/dateHelpers";
import { generateUUID } from "../../../utils/generators";
import { AgreementInstallment, AgreementType } from "../../../types";

export type CalculationMode = 'BY_INSTALLMENTS' | 'BY_INSTALLMENT_VALUE' | 'BY_VALUE_AND_COUNT';
export type CalculationResult = 'DISCOUNT' | 'SAME' | 'INCREASE';

interface AgreementSimulationParams {
    totalDebt: number;
    type: AgreementType;
    installmentsCount: number;
    installmentValue?: number;
    calculationMode?: CalculationMode;
    interestRate: number; // Mensal (%)
    firstDueDate: string;
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
    gracePeriod?: number;
    discount?: number;
    downPayment?: number;
}

export const simulateAgreement = (params: AgreementSimulationParams): { 
    installments: AgreementInstallment[], 
    negotiatedTotal: number,
    calculationResult?: CalculationResult,
    diffAmount?: number
} => {
    // === Sanitização de Entradas: Garante que nenhum NaN se propague ===
    const totalDebt = Number(params.totalDebt) || 0;
    const installmentsCount = Number(params.installmentsCount) || 0;
    const installmentValue = Number(params.installmentValue) || 0;
    const interestRate = Number(params.interestRate) || 0;
    const gracePeriod = Number(params.gracePeriod) || 0;
    const discount = Number(params.discount) || 0;
    const downPayment = Number(params.downPayment) || 0;
    const { 
        type, 
        calculationMode = 'BY_INSTALLMENTS',
        firstDueDate, 
        frequency, 
    } = params;
    
    const isValueAndCountMode = calculationMode === 'BY_VALUE_AND_COUNT';
    const baseAmount = Math.max(0, totalDebt - (isValueAndCountMode ? 0 : discount) - downPayment);
    
    let negotiatedTotal = baseAmount;
    let calculationResult: CalculationResult = 'SAME';
    let diffAmount = 0;
    let finalInstallmentValue = installmentValue;
    let finalInstallmentsCount = installmentsCount;

    if (calculationMode === 'BY_INSTALLMENTS') {
        if (type === 'PARCELADO_COM_JUROS' && baseAmount > 0 && finalInstallmentsCount > 0) {
            let monthsDuration = finalInstallmentsCount;
            if (frequency === 'WEEKLY') monthsDuration = finalInstallmentsCount / 4.33;
            if (frequency === 'BIWEEKLY') monthsDuration = finalInstallmentsCount / 2.16;
            if (gracePeriod > 0) monthsDuration += (gracePeriod / 30);
            
            const totalRate = (interestRate / 100) * monthsDuration;
            negotiatedTotal = baseAmount * (1 + totalRate);
        }
        if (finalInstallmentsCount > 0) {
            finalInstallmentValue = negotiatedTotal / finalInstallmentsCount;
        } else {
            finalInstallmentValue = 0;
        }

    } else if (calculationMode === 'BY_INSTALLMENT_VALUE') {
        if (finalInstallmentValue <= 0) {
            return { installments: [], negotiatedTotal: baseAmount, calculationResult: 'SAME', diffAmount: 0 };
        }

        if (type === 'PARCELADO_SEM_JUROS' || interestRate <= 0) {
            negotiatedTotal = baseAmount;
            finalInstallmentsCount = Math.ceil(negotiatedTotal / finalInstallmentValue);
        } else {
            let currentTotal = baseAmount;
            let tempCount = Math.ceil(baseAmount / finalInstallmentValue);
            
            for(let k=0; k<5; k++) { // Loop de convergência para cálculo de juros
                let months = tempCount;
                if (frequency === 'WEEKLY') months /= 4.33;
                if (frequency === 'BIWEEKLY') months /= 2.16;
                if (gracePeriod > 0) months += (gracePeriod/30);

                const totalRate = (interestRate / 100) * months;
                currentTotal = baseAmount * (1 + totalRate);
                
                const newCount = Math.ceil(currentTotal / finalInstallmentValue);
                if (newCount === tempCount) break;
                tempCount = newCount;
            }
            negotiatedTotal = currentTotal;
            finalInstallmentsCount = tempCount;
        }

    } else if (calculationMode === 'BY_VALUE_AND_COUNT') {
        negotiatedTotal = finalInstallmentValue * finalInstallmentsCount;
    }

    // ✅ Safety cap to prevent RangeError: Invalid time value or infinite loops
    if (finalInstallmentsCount > 600) finalInstallmentsCount = 600;
    if (finalInstallmentsCount <= 0) finalInstallmentsCount = 1;
    if (!isFinite(finalInstallmentsCount)) finalInstallmentsCount = 1;

    // Calculate Gain/Loss for all modes
    const originalPayable = totalDebt - downPayment;
    const diff = negotiatedTotal - originalPayable;

    if (Math.abs(diff) < 0.05) {
        calculationResult = 'SAME';
        diffAmount = 0;
    } else if (diff < 0) {
        calculationResult = 'DISCOUNT';
        diffAmount = Math.abs(diff);
    } else {
        calculationResult = 'INCREASE';
        diffAmount = diff;
    }

    const roundedInstallmentValue = isFinite(finalInstallmentValue) ? Math.round((finalInstallmentValue + Number.EPSILON) * 100) / 100 : 0;
    
    let diffCents = 0;
    if (calculationMode !== 'BY_VALUE_AND_COUNT') {
        const totalInstallmentsSum = roundedInstallmentValue * finalInstallmentsCount;
        diffCents = negotiatedTotal - totalInstallmentsSum;
    }

    const installments: AgreementInstallment[] = [];
    if (firstDueDate && isFinite(finalInstallmentsCount)) {
      let currentDate = parseDateOnlyUTC(firstDueDate);
      if (gracePeriod > 0) {
          currentDate = addDaysUTC(currentDate, gracePeriod);
      }

      for (let i = 1; i <= finalInstallmentsCount; i++) {
          let amount = roundedInstallmentValue;
          if (i === finalInstallmentsCount && calculationMode !== 'BY_VALUE_AND_COUNT') {
              amount += diffCents;
          }

          let dueDateStr = '';
          try {
              dueDateStr = currentDate.toISOString();
          } catch (e) {
              // Fallback to manual formatting if toISOString fails
              const y = currentDate.getUTCFullYear();
              const m = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
              const d = String(currentDate.getUTCDate()).padStart(2, '0');
              dueDateStr = `${y}-${m}-${d}T00:00:00.000Z`;
          }

          installments.push({
              id: generateUUID(),
              agreementId: 'temp',
              number: i,
              dueDate: dueDateStr,
              amount: isFinite(amount) ? parseFloat(amount.toFixed(2)) : 0,
              status: 'PENDING',
              paidAmount: 0
          });

          let daysToAdd = 30;
          if (frequency === 'WEEKLY') daysToAdd = 7;
          if (frequency === 'BIWEEKLY') daysToAdd = 15;
          currentDate = addDaysUTC(currentDate, daysToAdd);
      }
    }

    return { 
        installments, 
        negotiatedTotal: isFinite(negotiatedTotal) ? parseFloat(negotiatedTotal.toFixed(2)) : 0,
        calculationResult,
        diffAmount: isFinite(diffAmount) ? parseFloat(diffAmount.toFixed(2)) : 0
    };
};
