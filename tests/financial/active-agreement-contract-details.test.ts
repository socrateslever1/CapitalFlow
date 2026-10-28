import test from 'node:test';
import assert from 'node:assert/strict';
import { Loan, Agreement, LoanStatus } from '../../types';
import { calculateTotalDue, hasActiveAgreement, computeLoanRemainingBalance } from '../../domain/finance/calculations';

test('contrato com acordo ativo calcula a parcela aberta do acordo e não juros antigos', () => {
    const agreement: Agreement = {
        id: 'agr-1',
        loanId: 'loan-gracileide',
        totalDebtAtNegotiation: 8000,
        negotiatedTotal: 8000,
        interestRate: 0,
        installmentsCount: 20,
        frequency: 'MONTHLY',
        startDate: '2026-05-17',
        status: 'ACTIVE',
        createdAt: '2026-05-17',
        installments: [
            // 5 pagas de 400
            ...Array.from({ length: 5 }, (_, idx) => ({
                id: `agr-inst-${idx + 1}`,
                agreementId: 'agr-1',
                number: idx + 1,
                dueDate: `2026-0${idx + 5}-17`,
                amount: 400,
                paidAmount: 400,
                status: 'PAID' as const,
                paidDate: `2026-0${idx + 5}-17`
            })),
            // Parcela 6 vencida em 2026-10-17 com 11 dias de atraso
            {
                id: 'agr-inst-6',
                agreementId: 'agr-1',
                number: 6,
                dueDate: '2026-10-17',
                amount: 400,
                paidAmount: 0,
                status: 'PENDING' as const
            },
            // Parcelas 7 a 20 futuras
            ...Array.from({ length: 14 }, (_, idx) => ({
                id: `agr-inst-${idx + 7}`,
                agreementId: 'agr-1',
                number: idx + 7,
                dueDate: `2026-11-17`,
                amount: 400,
                paidAmount: 0,
                status: 'PENDING' as const
            }))
        ]
    };

    const loan: Loan = {
        id: 'loan-gracileide',
        clientId: 'client-gracileide',
        profile_id: 'profile-test',
        debtorName: 'GRACILEIDE VIEIRA DE CASTRO',
        debtorPhone: '(92) 99120-2666',
        debtorDocument: '00000000000',
        sourceId: 'source-test',
        preferredPaymentMethod: 'PIX',
        principal: 8000,
        interestRate: 13, // antiga taxa que gerava R$ 130 de juros
        finePercent: 2,
        dailyInterestPercent: 0.33,
        billingCycle: 'MONTHLY',
        startDate: '2026-01-01',
        status: LoanStatus.LATE,
        installments: [
            {
                id: 'old-inst-1',
                number: 1,
                dueDate: '2026-02-01',
                amount: 1000,
                principalRemaining: 0,
                interestRemaining: 130, // resíduo antigo do contrato original
                lateFeeAccrued: 0,
                paidTotal: 0,
                scheduledPrincipal: 1000,
                scheduledInterest: 130,
                paidPrincipal: 0,
                paidInterest: 0,
                paidLateFee: 0,
                status: LoanStatus.LATE
            }
        ],
        totalToReceive: 9040,
        ledger: [],
        notes: '',
        activeAgreement: agreement
    };

    assert.equal(hasActiveAgreement(loan), true);

    // Saldo restante total do contrato considera o acordo ativo (15 parcelas de 400 = 6000 + multa)
    const totalRemainingBalance = computeLoanRemainingBalance(loan);
    assert.equal(totalRemainingBalance.principalRemaining, 6000);
    assert.ok(totalRemainingBalance.totalRemaining >= 6000);

    // calculateTotalDue deve retornar o valor da parcela aberta do acordo (400 + atraso) e NÃO os 130 antigos!
    const due = calculateTotalDue(loan, loan.installments[0], '2026-10-28');
    assert.equal(due.principal, 400);
    assert.equal(due.interest, 0);
    assert.ok(due.lateFee > 0); // +1%/dia de atraso
    assert.equal(due.total, 400 + due.lateFee);
    assert.notEqual(due.total, 130);
});
