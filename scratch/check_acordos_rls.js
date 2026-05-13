const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  try {
    // We can't query information_schema easily via anon key. 
    // Let's just try to insert and see if it fails because of a missing column or if it's strictly RLS.
    // Or we can check the policies using raw RPC if it exists, but we probably don't have it.
    
    // Instead, let's fetch one row from acordos_inadimplencia to see the columns
    const { data, error } = await supabase.from('acordos_inadimplencia').select('*').limit(1);
    if (error) {
        console.error("Error fetching:", error);
    } else {
        if (data && data.length > 0) {
            console.log("Columns:", Object.keys(data[0]));
        } else {
            console.log("No data found, but table exists.");
        }
    }
  } catch (e) {
    console.error(e);
  }
}

checkTable();
