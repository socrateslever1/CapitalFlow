
export interface ImportCandidate {
    nome: string;
    documento: string;
    whatsapp: string;
    email?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    valor_base?: number; // Valor do empréstimo inicial (opcional)
    data_referencia?: string; // Data do empréstimo ou cadastro
    notas?: string;
    
    // Metadados de Curadoria
    status: 'OK' | 'AVISO' | 'ERRO';
    mensagens: string[];
    original_row: any;
}

export const FIELD_MAPS = [
    { key: 'nome', labels: ['nome', 'cliente', 'devedor', 'nome completo', 'razao social', 'nome do cliente'] },
    { key: 'documento', labels: ['cpf', 'cnpj', 'documento', 'identidade', 'cpf/cnpj', 'doc'] },
    { key: 'whatsapp', labels: ['whatsapp', 'telefone', 'celular', 'contato', 'fone', 'whats', 'tel'] },
    { key: 'email', labels: ['email', 'e-mail', 'correio', 'eletronico'] },
    { key: 'endereco', labels: ['endereco', 'logradouro', 'rua', 'residência', 'local'] },
    { key: 'cidade', labels: ['cidade', 'municipio', 'localidade'] },
    { key: 'uf', labels: ['uf', 'estado', 'sigla'] },
    { key: 'valor_base', labels: ['valor', 'saldo', 'debito', 'principal', 'divida', 'montante', 'emprestimo'] },
    { key: 'data_referencia', labels: ['data', 'vencimento', 'inicio', 'cadastro', 'referencia', 'data emprestimo'] },
    { key: 'notas', labels: ['notas', 'observacoes', 'info', 'detalhes', 'obs'] }
];
