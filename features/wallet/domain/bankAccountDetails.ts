import { parseWalletMoney } from '../utils/parseWalletMoney';

export const bankTextFields = {
  holder_name:'Nome do titular',holder_document:'CPF/CNPJ do titular',agency:'Agência',agency_digit:'Dígito da agência',
  account_number:'Número da conta',account_digit:'Dígito da conta',operation_code:'Operação da conta',other_products:'Outros produtos e observações',
} as const;
export const bankMoneyFields = {
  credit_card_limit:'Limite de crédito informado',overdraft_limit:'Limite do cheque especial',overdraft_used:'Cheque especial utilizado',
  loan_balance:'Limite de empréstimo disponível',loan_installment:'Limite de empréstimo utilizado',
} as const;
export type BankAccountDetails = Partial<Record<keyof typeof bankTextFields,string> & Record<keyof typeof bankMoneyFields,number> & {
  has_credit_card:boolean; has_overdraft:boolean; has_loans:boolean;
}>;
export type BankAccountDetailsDraft = Record<keyof typeof bankTextFields | keyof typeof bankMoneyFields,string> & {
  has_credit_card:boolean; has_overdraft:boolean; has_loans:boolean;
};
export function bankDetailsDraft(value: BankAccountDetails = {}): BankAccountDetailsDraft {
  return Object.fromEntries([
    ...Object.keys(bankTextFields).map(key=>[key,value[key as keyof BankAccountDetails] || '']),
    ...Object.keys(bankMoneyFields).map(key=>[key,value[key as keyof BankAccountDetails]===undefined?'':String(value[key as keyof BankAccountDetails]).replace('.',',')]),
    ...['has_credit_card','has_overdraft','has_loans'].map(key=>[key,value[key as keyof BankAccountDetails]===true]),
  ]) as BankAccountDetailsDraft;
}
export function normalizeBankDetails(value: BankAccountDetailsDraft): BankAccountDetails {
  const result: BankAccountDetails={};
  for(const key of Object.keys(bankTextFields) as Array<keyof typeof bankTextFields>){
    const text=value[key].trim();
    if(text.length>(key==='other_products'?2000:120))throw new Error(`${bankTextFields[key]} excede o tamanho permitido.`);
    if(text)result[key]=text;
  }
  for(const key of ['has_credit_card','has_overdraft','has_loans'] as const) if(value[key])result[key]=true;
  for(const key of Object.keys(bankMoneyFields) as Array<keyof typeof bankMoneyFields>){
    const enabled=key==='credit_card_limit'?value.has_credit_card:key.startsWith('overdraft')?value.has_overdraft:value.has_loans;
    if(enabled && value[key].trim())result[key]=parseWalletMoney(value[key],bankMoneyFields[key]);
  }
  return result;
}
