import { classifyStatementDescription } from '../../../utils/walletStatementPdf';

/**
 * Sugere somente categorias reconhecidas pelo classificador local já usado nos
 * extratos. Nunca substitui a escolha explícita do usuário.
 */
export function suggestWalletAccountCategory(description:string,manuallySelected:boolean):string|null{
  if(manuallySelected||!description.trim())return null;
  const candidate=classifyStatementDescription(description);
  return candidate==='Outros'?null:candidate;
}
