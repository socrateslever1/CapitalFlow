
import { supabase } from './lib/supabase';

async function checkDB() {
  const tables = ['loans', 'installments', 'clients', 'sources', 'transactions'];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
      
    if (error) {
      console.error(`Error counting ${table}:`, error.message);
    } else {
      console.log(`Table "${table}" has ${count} rows.`);
    }
  }
}

checkDB();
