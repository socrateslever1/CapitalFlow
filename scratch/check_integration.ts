import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hzchchbxkhryextaymkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const profileId = '62dcbb45-f02c-42ba-84a4-916af9854dea';
  
  const perfis = await supabase.from('perfis').select('id, nome_operador, nome_exibicao').eq('id', profileId).maybeSingle();
  console.log('Perfis:', JSON.stringify(perfis));

  const n8n = await supabase.from('n8n_automation_integrations').select('profile_id, session_name, active').eq('profile_id', profileId).maybeSingle();
  console.log('n8n_automation_integrations:', JSON.stringify(n8n));
}

run();
