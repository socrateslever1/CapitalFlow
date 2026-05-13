
import { GoogleGenAI, Type } from "@google/genai";
import { LegalDocumentParams, Agreement, Loan, UserProfile } from "../../../types";

export const legalAIService = {
  generateConfissaoPayload: async (
    agreement: Agreement,
    loan: Loan,
    activeUser: UserProfile,
    options: any
  ): Promise<LegalDocumentParams> => {
    const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!googleApiKey) {
      throw new Error("Chave da API do Gemini não configurada.");
    }

    const ai = new GoogleGenAI({ apiKey: googleApiKey });
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [{
            text: `
              Você é um ANALISTA JURÍDICO SÊNIOR. Sua tarefa é gerar um PAYLOAD JSON para um documento de CONFISSÃO DE DÍVIDA com NOTA PROMISSÓRIA vinculada.
              
              DADOS DO ACORDO:
              ${JSON.stringify(agreement, null, 2)}
              
              DADOS DO EMPRÉSTIMO:
              ${JSON.stringify(loan, null, 2)}
              
              DADOS DO CREDOR (USUÁRIO ATUAL):
              ${JSON.stringify(activeUser, null, 2)}
              
              OPÇÕES CONFIGURADAS:
              ${JSON.stringify(options, null, 2)}
              
              REGRAS:
              1. O retorno deve ser APENAS o JSON, sem explicações.
              2. Use "[PREENCHER]" para qualquer dado obrigatório que não esteja presente nos objetos acima.
              3. A dívida confessada deve ser o valor total negociado no acordo (negotiatedTotal).
              4. Se 'incluirGarantia' for true, preencha os campos de garantia.
              5. Se 'incluirAvalista' for true, preencha os campos do avalista.
              6. 'gerar_nota_promissoria' deve ser sempre true.
              7. O JSON deve seguir a interface LegalDocumentParams.
            `
          }]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            loanId: { type: Type.STRING },
            clientName: { type: Type.STRING },
            debtorName: { type: Type.STRING },
            debtorDoc: { type: Type.STRING },
            debtorPhone: { type: Type.STRING },
            debtorAddress: { type: Type.STRING },
            creditorName: { type: Type.STRING },
            creditorDoc: { type: Type.STRING },
            creditorAddress: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            totalDebt: { type: Type.NUMBER },
            originDescription: { type: Type.STRING },
            city: { type: Type.STRING },
            state: { type: Type.STRING },
            witnesses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  doc: { type: Type.STRING }
                }
              }
            },
            contractDate: { type: Type.STRING },
            agreementDate: { type: Type.STRING },
            installments: { type: Type.NUMBER },
            timestamp: { type: Type.STRING },
            discount: { type: Type.NUMBER },
            gracePeriod: { type: Type.NUMBER },
            downPayment: { type: Type.NUMBER },
            incluirGarantia: { type: Type.BOOLEAN },
            tipoGarantia: { type: Type.STRING },
            descricaoGarantia: { type: Type.STRING },
            incluirPenhoraAutomatica: { type: Type.BOOLEAN },
            incluirAvalista: { type: Type.BOOLEAN },
            avalistaNome: { type: Type.STRING },
            avalistaCPF: { type: Type.STRING },
            avalistaEndereco: { type: Type.STRING },
            multaPercentual: { type: Type.NUMBER },
            jurosMensal: { type: Type.NUMBER },
            honorariosPercentual: { type: Type.NUMBER },
            gerar_nota_promissoria: { type: Type.BOOLEAN },
            campos_faltantes: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["loanId", "debtorName", "creditorName", "totalDebt"]
        }
      }
    });

    const result = await model;
    const response = result.text;
    if (!response) throw new Error("IA não retornou dados.");
    
    return JSON.parse(response) as LegalDocumentParams;
  }
};
