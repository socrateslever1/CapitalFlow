
import { supabase } from '../lib/supabase';

async function setupAgreementColumns() {
  console.log('Verificando colunas na tabela acordos_inadimplencia...');

  const columnsToAdd = [
    { name: 'calculation_mode', type: 'text', default: "'BY_INSTALLMENTS'" },
    { name: 'installment_value', type: 'numeric', default: '0' },
    { name: 'calculation_result', type: 'text', default: 'NULL' }
  ];

  for (const col of columnsToAdd) {
    try {
      // Tenta selecionar a coluna para ver se existe
      const { error } = await supabase
        .from('acordos_inadimplencia')
        .select(col.name)
        .limit(1);

      if (error && error.code === 'PGRST301') { // Coluna não encontrada (código típico do PostgREST)
        console.log(`Coluna ${col.name} não encontrada. Adicionando...`);
        
        // Como não temos acesso direto a DDL via client, vamos tentar usar uma RPC se existir,
        // ou instruir o usuário. Mas dado o ambiente, vamos tentar simular um comando SQL via RPC 'exec_sql' se disponível,
        // ou assumir que o usuário precisa rodar o SQL.
        
        // TENTATIVA VIA RPC (comum em setups supabase customizados)
        const { error: rpcError } = await supabase.rpc('exec_sql', {
          sql: `ALTER TABLE acordos_inadimplencia ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT ${col.default};`
        });

        if (rpcError) {
            console.error(`Erro ao adicionar coluna ${col.name} via RPC:`, rpcError.message);
            console.log(`\nPOR FAVOR, EXECUTE O SEGUINTE SQL NO SUPABASE:\nALTER TABLE acordos_inadimplencia ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT ${col.default};`);
        } else {
            console.log(`Coluna ${col.name} adicionada com sucesso.`);
        }

      } else if (!error) {
        console.log(`Coluna ${col.name} já existe.`);
      } else {
        console.error(`Erro ao verificar coluna ${col.name}:`, error.message);
      }
    } catch (e) {
      console.error(`Exceção ao processar ${col.name}:`, e);
    }
  }
}

setupAgreementColumns();
