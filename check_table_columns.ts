
import { supabase } from './lib/supabase';

async function checkColumns() {
  const { data, error } = await supabase
    .from('contratos')
    .select('*')
    .limit(0); // Query metadata instead? Supabase doesn't easily allow metadata queries here.

  // Let's try selecting a known column + a potentially new column
  const { data: testData, error: testError } = await supabase
    .from('contratos')
    .select('id, last_billed_at, billing_count')
    .limit(1);

  if (testError) {
    console.log('Error testing columns:', testError.message);
  } else {
    console.log('Columns last_billed_at and billing_count exist.');
  }
}

checkColumns();
