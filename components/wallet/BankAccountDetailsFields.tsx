import React from 'react';
import { bankTextFields, bankMoneyFields, type BankAccountDetails, type BankAccountDetailsDraft } from '../../features/wallet/domain/bankAccountDetails';
import { formatMoney } from '../../utils/formatters';
import { FinancialCalculatorInput } from '../forms/FinancialCalculatorInput';

const input='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none';
export const BankAccountDetailsFields: React.FC<{value:BankAccountDetailsDraft;onChange:(value:BankAccountDetailsDraft)=>void;showCreditCard?:boolean}> = ({value,onChange,showCreditCard=true}) => {
  const change=(key:keyof BankAccountDetailsDraft,next:string|boolean)=>onChange({...value,[key]:next});
  return <fieldset className="space-y-4 border-t border-slate-800 pt-4">
    <legend className="px-1 text-sm font-semibold text-slate-200">Dados bancários opcionais</legend>
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-300">{bankTextFields.holder_name}
          <input maxLength={120} className={input} value={value.holder_name} onChange={event=>change('holder_name',event.target.value)}/>
        </label>
        <label className="text-xs font-medium text-slate-300">{bankTextFields.holder_document}
          <input maxLength={120} className={input} value={value.holder_document} onChange={event=>change('holder_document',event.target.value)}/>
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2.5 sm:grid-cols-[minmax(0,1fr)_6.5rem] sm:gap-3">
        <label className="min-w-0 text-xs font-medium text-slate-300">{bankTextFields.agency}
          <input maxLength={120} className={input} value={value.agency} onChange={event=>change('agency',event.target.value)}/>
        </label>
        <label className="min-w-0 text-xs font-medium text-slate-300"><span className="block truncate" title={bankTextFields.agency_digit}>Dígito</span>
          <input maxLength={120} aria-label={bankTextFields.agency_digit} className={input} value={value.agency_digit} onChange={event=>change('agency_digit',event.target.value)}/>
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] gap-2.5 sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem] sm:gap-3">
        <label className="min-w-0 text-xs font-medium text-slate-300">{bankTextFields.account_number}
          <input maxLength={120} className={input} value={value.account_number} onChange={event=>change('account_number',event.target.value)}/>
        </label>
        <label className="min-w-0 text-xs font-medium text-slate-300"><span className="block truncate" title={bankTextFields.account_digit}>Dígito</span>
          <input maxLength={120} aria-label={bankTextFields.account_digit} className={input} value={value.account_digit} onChange={event=>change('account_digit',event.target.value)}/>
        </label>
        <label className="min-w-0 text-xs font-medium text-slate-300"><span className="block truncate" title={bankTextFields.operation_code}>Operação</span>
          <input maxLength={120} aria-label={bankTextFields.operation_code} className={input} value={value.operation_code} onChange={event=>change('operation_code',event.target.value)}/>
        </label>
      </div>
    </div>
    <div className="space-y-4">
      {([
        ['has_credit_card','Possui cartão de crédito',['credit_card_limit']],
        ['has_overdraft','Possui cheque especial',['overdraft_limit','overdraft_used']],
        ['has_loans','Possui limite de empréstimo',['loan_balance']],
      ] as const).filter(([key])=>showCreditCard || key!=='has_credit_card').map(([key,label,amounts])=><div key={key} className="space-y-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-200"><input type="checkbox" checked={value[key]} onChange={event=>change(key,event.target.checked)} className="h-4 w-4 accent-blue-500"/>{label}</label>
        {value[key] && <div className={`grid gap-3 pl-4 sm:pl-7 ${amounts.length > 1 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>{amounts.map(amount=><label key={amount} className="min-w-0 text-xs text-slate-300">{bankMoneyFields[amount]} (R$)
          <FinancialCalculatorInput placeholder="Ex.: 1.500,00" className={input} value={value[amount]} fieldLabel={bankMoneyFields[amount]} onCommit={next=>change(amount,next)}/>
        </label>)}</div>}
      </div>)}
    </div>
    <label className="block text-xs text-slate-300">Outros produtos e observações
      <textarea rows={3} maxLength={2000} className={input} value={value.other_products} onChange={event=>change('other_products',event.target.value)} placeholder="Investimentos, seguros, detalhes de contratos ou outros produtos opcionais"/>
    </label>
    <p className="text-xs leading-relaxed text-slate-400">Estes detalhes são informativos. {showCreditCard ? 'Limites de crédito, cheque especial e empréstimos informados' : 'Cheque especial e limites de empréstimo informados'} aqui não alteram o saldo e não geram lançamentos ou contas a pagar.</p>
  </fieldset>;
};

export const BankAccountDetailsSummary: React.FC<{details:BankAccountDetails;linkedCards:number}> = ({details,linkedCards}) => <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
  <h3 className="text-base font-semibold text-white">Dados da conta e produtos</h3>
  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {(Object.keys(bankTextFields) as Array<keyof typeof bankTextFields>).filter(key=>details[key]).map(key=><div key={key} className="min-w-0"><dt className="text-xs text-slate-400">{bankTextFields[key]}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">{details[key]}</dd></div>)}
    {linkedCards>0 && <div><dt className="text-xs text-slate-400">Cartões cadastrados e vinculados</dt><dd className="mt-1 text-sm text-slate-200">{linkedCards}</dd></div>}
    {details.has_credit_card && <div><dt className="text-xs text-slate-400">Cartão de crédito informado</dt><dd className="mt-1 text-sm text-slate-200">Sim</dd></div>}
    {details.has_overdraft && <div><dt className="text-xs text-slate-400">Cheque especial informado</dt><dd className="mt-1 text-sm text-slate-200">Sim</dd></div>}
    {details.has_loans && <div><dt className="text-xs text-slate-400">Limite de empréstimo</dt><dd className="mt-1 text-sm text-slate-200">Sim</dd></div>}
    {(Object.keys(bankMoneyFields) as Array<keyof typeof bankMoneyFields>).filter(key=>details[key]!==undefined).map(key=><div key={key}><dt className="text-xs text-slate-400">{bankMoneyFields[key]}</dt><dd className="mt-1 text-sm tabular-nums text-slate-200">{formatMoney(details[key]!)}</dd></div>)}
  </dl>
  {!Object.keys(details).length && !linkedCards && <p className="text-sm text-slate-400">Nenhum detalhe adicional informado. Use Editar para preencher os dados opcionais.</p>}
</section>;
