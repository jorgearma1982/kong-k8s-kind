import http from 'k6/http';
import {check, sleep} from 'k6';
import { Rate } from 'k6/metrics';

const reqRate = new Rate('http_req_rate');

export const options = {
  stages: [
    { duration: '20s', target: 10 }, // ramp up to 10 users
    { duration: '60s', target: 50 }, // stay at 50 for 4 1 minute
    { duration: '20s', target: 0 }, // scale down. (optional)
  ],
  thresholds: {
    // TODO
    'checks': ['rate>0.9'],
    // 90% of requests must finish within 400ms.
    'http_req_duration': ['p(90) < 100'],
    'http_req_rate': ['rate>=0'],
  },
};

export default function () {
  const url = 'http://localhost/whoami';

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.get(url, params);

  check(res, {
    'status code is 200': (r) => r.status === 200,
  });

  reqRate.add(true);
  reqRate.add(false);
  reqRate.add(1);
  reqRate.add(0);

  sleep(1);
}
