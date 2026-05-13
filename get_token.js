
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hzchchbxkhryextaymkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function debugDB() {
  const { data: tables, error: tableError } = await supabase
    .from('clientes')
    .select('id, name')
    .limit(1);

  if (tableError) {
    console.error('Error fetching clientes:', tableError);
  } else {
    console.log('CLIENTES found:', tables.length);
  }

  const { data: loans, error: loanError } = await supabase
    .from('contratos')
    .select('id, portal_token')
    .limit(5);

  if (loanError) {
    console.error('Error fetching contratos:', loanError);
  } else {
    console.log('CONTRATOS found:', loans.length);
    loans.forEach(l => console.log(`ID: ${l.id}, TOKEN: ${l.portal_token}`));
  }
}

debugDB();
