const fs = require('fs');
const path = require('path');

async function test() {
  const envPath = 'C:\\docker\\n8nwahalocal\\.env';
  const envText = fs.readFileSync(envPath, 'utf8');
  
  let profileId = '';
  let secret = '';
  
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('CAPITALFLOW_PROFILE_ID=')) {
      profileId = trimmed.split('=')[1].trim();
    } else if (trimmed.startsWith('CAPITALFLOW_N8N_SECRET=')) {
      secret = trimmed.split('=')[1].trim();
    }
  }

  if (!profileId || !secret) {
    console.error('Missing env vars in .env file');
    process.exit(1);
  }

  const endpoint = 'https://hzchchbxkhryextaymkn.supabase.co/functions/v1/capitalflow-n8n-tools';

  // Test 1: Real client
  const msgId1 = 'test-n8n-real-' + Date.now();
  const body1 = {
    action: 'context',
    organization_id: profileId,
    phone: '5592993926283',
    message_id: msgId1,
    message: 'teste_integracao',
    message_type: 'text'
  };

  console.log('--- TEST 1: CLIENTE REAL ---');
  const res1 = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-capitalflow-secret': secret
    },
    body: JSON.stringify(body1)
  });

  const json1 = await res1.json();
  console.log('Test 1 HTTP Status:', res1.status);
  console.log('Test 1 API Status:', json1.status);
  console.log('Test 1 Cliente Identificado:', json1.status === 'identified' ? 'sim' : 'não');
  console.log('Test 1 Possui Contratos:', Array.isArray(json1.contracts) && json1.contracts.length > 0 ? 'sim' : 'não');
  console.log('Test 1 Quantidade de Parcelas Pendentes:', Array.isArray(json1.pending) ? json1.pending.length : 0);
  console.log('Test 1 Portal Link Presente:', Boolean(json1.portal_link) ? 'sim' : 'não');

  // Test 2: Unregistered phone
  const msgId2 = 'test-n8n-unreg-' + Date.now();
  const body2 = {
    action: 'context',
    organization_id: profileId,
    phone: '5500999999999',
    message_id: msgId2,
    message: 'teste_integracao',
    message_type: 'text'
  };

  console.log('\n--- TEST 2: NÚMERO NÃO CADASTRADO ---');
  const res2 = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-capitalflow-secret': secret
    },
    body: JSON.stringify(body2)
  });

  const json2 = await res2.json();
  console.log('Test 2 HTTP Status:', res2.status);
  console.log('Test 2 API Status:', json2.status);

  if (res1.status === 200 && json1.status === 'identified' && res2.status === 200 && json2.status === 'not_identified') {
    console.log('\nRESULT: BARREIRA DE IDENTIFICAÇÃO VALIDADA');
  } else {
    console.log('\nRESULT: TEST FAILED', { res1: res1.status, json1: json1.status, res2: res2.status, json2: json2.status });
  }
}

test().catch(err => {
  console.error('Test execution error:', err.message);
  process.exit(1);
});
