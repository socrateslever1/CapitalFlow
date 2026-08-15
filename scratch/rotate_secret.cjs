const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run() {
  // 1. Generate 48 random bytes encoded as hex (96 hex chars, high entropy)
  const newSecret = crypto.randomBytes(48).toString('hex');
  
  // Verify length >= 32
  if (newSecret.length < 32) {
    throw new Error('Secret length too short');
  }

  // 2. Calculate SHA-256 hex digest
  const hashHex = crypto.createHash('sha256').update(newSecret, 'utf8').digest('hex');
  console.log('SHA-256 hash length:', hashHex.length);

  // 3. Update database via supabase CLI query --linked
  const sql = `UPDATE public.n8n_automation_integrations SET secret_hash = '${hashHex}', updated_at = now() WHERE profile_id = '62dcbb45-f02c-42ba-84a4-916af9854dea';`;
  console.log('Executing DB update...');
  const dbOutput = execSync(`npx supabase db query --linked "${sql}"`, { encoding: 'utf8', cwd: 'c:\\Users\\LEVER\\Documents\\Github\\CapitalFlow' });
  console.log('DB Update succeeded.');

  // 4. Write C:\docker\n8nwahalocal\.env
  const dockerDir = 'C:\\docker\\n8nwahalocal';
  if (!fs.existsSync(dockerDir)) {
    fs.mkdirSync(dockerDir, { recursive: true });
  }

  const envPath = path.join(dockerDir, '.env');
  const envContent = `CAPITALFLOW_PROFILE_ID=62dcbb45-f02c-42ba-84a4-916af9854dea\nCAPITALFLOW_N8N_SECRET=${newSecret}\n`;
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('.env file written successfully at:', envPath);
}

try {
  run();
} catch (err) {
  console.error('Error during secret rotation:', err.message);
  process.exit(1);
}
