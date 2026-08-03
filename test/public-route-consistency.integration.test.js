import { describe, expect, it } from 'vitest';
import worker from '../src/worker.js';

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

describe('public route consistency', () => {
  it.each(['geo', 'uspolicy', 'power', 'news', 'traces'])(
    'redirects the dormant /%s entry point instead of labeling Live Top 50 as another product',
    async (view) => {
      const response = await worker.fetch(
        new Request(`http://localhost/${view}`),
        {},
        context,
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://chaindump.xyz/');
    },
  );
});
