
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hzchchbxkhryextaymkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seed() {
  console.log('Seed started...');

  // 1. Criar Cliente
  const { data: client, error: clientError } = await supabase
    .from('clientes')
    .insert({
      name: 'Cliente de Teste',
      document: '12345678901',
      phone: '11999999999',
      email: 'teste@exemplo.com'
    })
    .select()
    .single();

  if (clientError) {
    console.error('Error creating client:', clientError);
    return;
  }
  console.log('Client created:', client.id);

  // 2. Criar Contrato
  const { data: loan, error: loanError } = await supabase
    .from('contratos')
    .insert({
      client_id: client.id,
      amount: 1000.00,
      status: 'ATIVO',
      billingCycle: 'MONTHLY',
      portal_token: crypto.randomUUID(),
      portal_shortcode: '123456'
    })
    .select()
    .single();

  if (loanError) {
    console.error('Error creating loan:', loanError);
    return;
  }
  console.log('Loan created:', loan.id);

  // 3. Criar Parcelas
  const { error: parcelsError } = await supabase
    .from('parcelas')
    .insert([
      { loan_id: loan.id, number: 1, dueDate: '2026-04-10', amount: 500.00, status: 'PENDING', principalRemaining: 500.00, interestRemaining: 0 },
      { loan_id: loan.id, number: 2, dueDate: '2026-05-10', amount: 500.00, status: 'PENDING', principalRemaining: 500.00, interestRemaining: 0 }
    ]);

  if (parcelsError) {
    console.error('Error creating parcels:', parcelsError);
    return;
  }
  console.log('Parcels created!');

  console.log('SEED COMPLETE!');
  console.log(`PORTAL LINK: http://localhost:3000/?portal=${loan.portal_token}&code=${loan.portal_shortcode}`);
}

seed();
