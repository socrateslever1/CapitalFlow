import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:4173';
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl);

if (!isLocal && __ENV.ALLOW_REMOTE_LOAD !== '1') {
  throw new Error('Teste de stress bloqueado fora de localhost. Defina ALLOW_REMOTE_LOAD=1 apenas em ambiente isolado.');
}

export const options = {
  stages: [
    { duration: '10s', target: 25 },
    { duration: '15s', target: 75 },
    { duration: '20s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500', 'p(99)<2500'],
    checks: ['rate>0.98'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/`, {
    tags: { name: 'app-shell-stress' },
    headers: { 'Cache-Control': 'no-cache' },
  });

  check(response, {
    'status 200': (r) => r.status === 200,
    'HTML não vazio': (r) => String(r.body || '').length > 100,
  });

  sleep(0.2);
}
