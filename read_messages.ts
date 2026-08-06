import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
  const { data, error } = await supabase
    .from("n8n_message_events")
    .select("created_at, direction, status, metadata, client_id, phone_hash")
    .order("created_at", { ascending: false })
    .limit(10);
    
  if (error) {
    console.error(error);
    return;
  }
  
  for (const msg of data.reverse()) {
    console.log(`[${msg.created_at}] ${msg.direction} (${msg.status}) - ${msg.phone_hash}`);
    console.log(`Body: ${JSON.stringify(msg.metadata)}`);
    console.log("-------------------");
  }
}
run();
