import { describe, expect, it } from 'vitest';
import { clientKey } from './throttle';

function request(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/admin/login', { method: 'POST', headers });
}

describe('clientKey', () => {
  it('takes the client from the front of x-forwarded-for', () => {
    // The platform appends its own hops, so the caller is the first entry.
    expect(clientKey(request({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 10.0.0.1' }))).toBe(
      'ip:203.0.113.7',
    );
  });

  it('trims surrounding space', () => {
    expect(clientKey(request({ 'x-forwarded-for': '  203.0.113.7 , 10.0.0.1' }))).toBe(
      'ip:203.0.113.7',
    );
  });

  it('falls back to x-real-ip', () => {
    expect(clientKey(request({ 'x-real-ip': '203.0.113.9' }))).toBe('ip:203.0.113.9');
  });

  it('prefers x-forwarded-for when both are present', () => {
    expect(
      clientKey(request({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.9' })),
    ).toBe('ip:203.0.113.7');
  });

  it('gives up rather than putting every caller in one bucket', () => {
    // An empty key means "do not throttle". Sharing a bucket across unrelated
    // callers would let one of them lock out all the others.
    expect(clientKey(request({}))).toBe('');
    expect(clientKey(request({ 'x-forwarded-for': '   ' }))).toBe('');
  });
});
