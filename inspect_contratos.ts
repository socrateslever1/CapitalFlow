
import { supabase } from './lib/supabase';

async function checkTableColumns() {
  const { data, error } = await supabase
    .from('contratos')
    .select('*')
    .limit(1);

  if (error) {
    if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.error('Schema error:', error.message);
    } else {
        console.error('Error fetching data:', error);
    }
  } else {
    if (data && data.length > 0) {
      console.log('Columns found in contratos:', Object.keys(data[0]));
    } else {
      console.log('No data, but table exists and schema is queryable. You might need to check the migration files.');
    }
  }
}

checkTableColumns();
