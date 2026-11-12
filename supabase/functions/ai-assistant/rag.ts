export type KnowledgeChunk = {
  id: string;
  title: string;
  category: 'wallet' | 'cards' | 'contracts' | 'sources' | 'security' | 'flux';
  content: string;
};

export type RetrievedChunk = KnowledgeChunk & {
  score: number;
};

export const CAPITALFLOW_KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    id: 'cf-doc-wallet-vs-sources',
    title: 'Diferença entre Minha Carteira e Fontes de Capital',
    category: 'wallet',
    content:
      'Minha Carteira representa as contas bancárias pessoais (saldo efetivo em conta corrente ou poupança), cartões de crédito e compromissos pessoais a pagar. Fontes de Capital representam o capital operacional alocado para concessão de empréstimos e contratos. Nunca confunda saldo em conta com limite de crédito ou capital disponível em fontes.',
  },
  {
    id: 'cf-doc-cards-invoice',
    title: 'Regras de Cartão de Crédito, Limite e Fatura',
    category: 'cards',
    content:
      'No módulo de cartões, current_bill representa a fatura atual em aberto, credit_limit é o limite total e used_limit é o limite comprometido (que inclui compras parceladas futuras além da fatura atual). Compra registrada em cartão não equivale a parcela vencida; o pagamento da fatura exige ação explícita nas telas protegidas da carteira.',
  },
  {
    id: 'cf-doc-contracts-interest',
    title: 'Contratos, Parcelas e Cálculo de Juros em Aberto',
    category: 'contracts',
    content:
      'Em contratos de empréstimo, o lucro em aberto é calculado a partir de interest_remaining nas parcelas não pagas (status diferente de PAID), e o principal em aberto por principal_remaining. Parcelas em atraso têm status LATE ou data de vencimento anterior à data comercial corrente no fuso America/Manaus.',
  },
  {
    id: 'cf-doc-payables-commitments',
    title: 'Compromissos a Pagar e Liquidez de Curto Prazo',
    category: 'wallet',
    content:
      'Compromissos (personal_wallet_payables) listam contas e boletos pendentes (status diferente de PAID e CANCELED). A saúde de caixa de curto prazo compara o saldo líquido em contas da carteira frente aos compromissos vencidos e aos que vencem nos próximos 7 dias.',
  },
  {
    id: 'cf-doc-security-readonly',
    title: 'Política Read-Only e Segurança do Assistente Flux',
    category: 'security',
    content:
      'O Flux opera estritamente em modo READ_ONLY: pode consultar saldos, faturas, contratos, fontes e alertas apenas do usuário autenticado via JWT e perfil master. O Flux jamais executa pagamentos, estornos, edições de saldo ou exclusões, e nunca processa ou armazena senhas, PIN, CVV/CVC ou tokens secretos.',
  },
  {
    id: 'cf-doc-privacy-memory',
    title: 'Privacidade e Armazenamento Local Cifrado',
    category: 'flux',
    content:
      'O histórico recente de conversa do Flux é armazenado localmente no dispositivo via IndexedDB com criptografia AES-GCM 256-bit não-extraível vinculada ao perfil, com retenção de 30 dias. Quando o modo de privacidade (olho oculto) está ativo, o painel do Flux é fechado e valores não são exibidos em balões proativos.',
  },
];

const EMBEDDING_DIM = 128;

function normalizeTextTokens(text: string): string[] {
  const clean = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length >= 2);
  const tokens: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }
  return tokens;
}

function fnv1aHash(str: string, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

/** Deterministic local dense embedding (feature hashing over unigrams + bigrams). */
export function computeLocalEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = normalizeTextTokens(text);
  for (const token of tokens) {
    const h1 = fnv1aHash(token, 2166136261);
    const h2 = fnv1aHash(token, 16777619);
    const idx = h1 % dim;
    const sign = (h2 & 1) === 0 ? 1 : -1;
    const weight = token.includes('_') ? 1.35 : 1.0;
    vec[idx] += sign * weight;
  }
  return l2Normalize(vec);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Computes an embedding using Gemini's text-embedding-004 when an API key is provided
 * and falls back seamlessly to local deterministic vectorization on error/offline.
 */
export async function computeEmbeddingWithFallback(
  text: string,
  geminiApiKey?: string | null,
): Promise<{ vector: number[]; provider: 'gemini-embedding' | 'local-hash-embedding' }> {
  if (geminiApiKey) {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiApiKey },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: text.slice(0, 2000) }] },
          }),
          signal: AbortSignal.timeout(3_500),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const values = data?.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          return { vector: l2Normalize(values.map(Number)), provider: 'gemini-embedding' };
        }
      } else {
        await res.body?.cancel();
      }
    } catch {
      /* Fallback to deterministic local embedding */
    }
  }
  return { vector: computeLocalEmbedding(text), provider: 'local-hash-embedding' };
}

type IndexedChunk = {
  chunk: KnowledgeChunk;
  vector: number[];
};

export class FluxVectorStore {
  private readonly entries: IndexedChunk[];

  constructor(chunks: KnowledgeChunk[] = CAPITALFLOW_KNOWLEDGE_BASE) {
    this.entries = chunks.map(chunk => ({
      chunk,
      vector: computeLocalEmbedding(`${chunk.title} ${chunk.category} ${chunk.content}`),
    }));
  }

  search(query: string, topK = 3, minScore = 0.08): RetrievedChunk[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const queryVec = computeLocalEmbedding(trimmed);
    return this.entries
      .map(entry => ({
        ...entry.chunk,
        score: Math.round(cosineSimilarity(queryVec, entry.vector) * 1000) / 1000,
      }))
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
  }
}

export const defaultVectorStore = new FluxVectorStore();

