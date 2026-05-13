
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hzchchbxkhryextaymkn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Needs to be provided, but anon key might be enough to check pg_catalog? No, needs admin

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkChatTables() {
  console.log('Testando conexão...');
  
  const { data, error } = await supabase.from('clientes').select('id').limit(1);

  if (error) {
    console.log('Erro na conexão:', error.message);
  } else {
    console.log('Conexão OK com a tabela clientes!');
  }

  console.log('Testando chat...');
  const { data: chatData, error: chatError } = await supabase.from('mensagens_suporte').select('*').limit(1);
  
  if (chatError) {
      console.log('Erro tabela chat:', chatError);
  } else {
      console.log('Tabela chat existe!');
  }
  
  const { data: tickData, error: tickError } = await supabase.from('support_tickets').select('*').limit(1);
  if (tickError) console.log('Erro tabela tickets:', tickError);
}

checkChatTables();
