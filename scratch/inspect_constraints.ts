import { supabase } from '../lib/supabase';

async function main() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        tc.constraint_name,
        tc.table_name,
        cc.check_clause
      FROM
        information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
      WHERE
        tc.constraint_type = 'CHECK'
        AND tc.table_name = 'assinaturas_documento';
    `
  });
  if (error) {
    console.error('Error executing exec_sql:', error);
    
    // Let's also try to query the REST endpoint directly or select the table to see if it gives details.
    console.log('Trying to insert a dummy record with invalid papel to see the error...');
    const { error: insertError } = await supabase.from('assinaturas_documento').insert({
      document_id: '00000000-0000-0000-0000-000000000000',
      hash_assinado: 'test',
      nome: 'test',
      papel: 'INVALID_ROLE'
    });
    console.log('Dummy insert error details:', insertError);
  } else {
    console.log('Constraints:', JSON.stringify(data, null, 2));
  }
}

main();
