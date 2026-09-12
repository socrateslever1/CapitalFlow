import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '20s', target: 25 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1200'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:4173';

export default function () {
  const response = http.get(`${baseUrl}/`, {
    tags: { name: 'app-shell' },
  });

  check(response, {
    'status 200': (r) => r.status === 200,
    'HTML do CapitalFlow carregado': (r) => String(r.body || '').length > 100,
  });

  sleep(0.5);
}
