import { classifyStatementDescription } from '../../../utils/walletStatementPdf';

/**
 * Sugere somente categorias reconhecidas pelo classificador local já usado nos
 * extratos. Nunca substitui a escolha explícita do usuário.
 */
export function suggestWalletAccountCategory(description:string,manuallySelected:boolean):string|null{
  if(manuallySelected||!description.trim())return null;
  // No lançamento manual, serviços da plataforma Google ficam em "Serviços";
  // a classificação do importador pode usar "Assinaturas" para linhas de fatura.
  if (/google/i.test(description)) return 'Serviços';
  const candidate=classifyStatementDescription(description);
  return candidate==='Outros'?null:candidate;
}
