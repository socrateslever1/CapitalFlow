/**
 * Remote OCR of a card photograph can disclose PAN/CVC to an external provider.
 * Keep registration manual until on-device redaction/OCR is independently audited.
 */
export interface RecognizedCardData {
  nickname: string;
  issuer: string;
  brand: string;
  last_four: string;
  credit_limit?: number;
  closing_day?: number;
  due_day?: number;
  primary_color?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
export async function recognizeCardFromImage(_imageInput: File | string): Promise<RecognizedCardData> {
  throw new Error('Por segurança, a leitura remota de foto do cartão foi desativada. Cadastre banco, bandeira e quatro últimos dígitos manualmente. Não envie fotos com número completo ou CVC.');
}
