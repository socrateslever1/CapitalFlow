
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hzchchbxkhryextaymkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
    const { data, error } = await supabase
        .from('contratos')
        .select('id, debtor_name, status, portal_token, portal_shortcode');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('All Contracts:');
    data.forEach(c => {
        console.log(`- ${c.debtor_name}: Status=${c.status}, Token=${c.portal_token || 'NULL'}, Code=${c.portal_shortcode || 'NULL'}`);
    });
}

check();
