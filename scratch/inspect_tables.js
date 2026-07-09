import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hzchchbxkhryextaymkn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log("Testing notificacoes item_id...");
  const { data, error } = await supabase.from('notificacoes').insert({
    titulo: 'Test',
    mensagem: 'Test',
    item_type: 'test',
    item_id: 'not-a-uuid' // If item_id is uuid, this will throw syntax error
  });
  
  console.log("Result:", { data, error });
}

inspect();
