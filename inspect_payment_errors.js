import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hzchchbxkhryextaymkn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log("Fetching latest errored payment intent...");
  const { data, error } = await supabase
    .from('payment_charges')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2);
    
  if (error) {
    console.error("Error reading payment_charges:", error.message);
  } else {
    console.log("Latest charges status and payloads:\n");
    data.forEach((charge, idx) => {
      console.log(`Charge #${idx + 1}:`);
      console.log(`- Created At: ${charge.created_at}`);
      console.log(`- Status: ${charge.status}`);
      console.log(`- Provider: ${charge.provider}`);
      console.log(`- Provider Status: ${charge.provider_status}`);
      console.log(`- Payer Name: ${charge.payer_name}`);
      console.log(`- Provider Payload:`, JSON.stringify(charge.provider_payload, null, 2));
      console.log("------------------------------------------\n");
    });
  }
}

inspect();
