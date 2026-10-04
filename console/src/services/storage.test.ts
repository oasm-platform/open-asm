import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPresignedBlob,
  fetchPresignedText,
  uploadToPresignedUrl,
} from './storage';

/**
 * Replace `global.fetch` with a stub that answers with the given responses in
 * order, and return the mock so callers can inspect the request init.
 */
function mockFetch(...responses: Response[]) {
  const queue = [...responses];
  const fetchMock = vi.fn(async () => queue.shift() ?? new Response(''));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const callOf = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadToPresignedUrl', () => {
  it('PUTs with the exact Content-Type that was signed', async () => {
    const fetchMock = mockFetch(new Response('', { status: 200 }));

    await uploadToPresignedUrl(
      'https://s3.test/put?X-Amz-Signature=abc',
      'raw payload',
      'text/markdown',
    );

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('https://s3.test/put?X-Amz-Signature=abc');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'text/markdown' });
    expect(init.body).toBe('raw payload');
  });

  it('sends nothing that would perturb the signature', async () => {
    // No X-Workspace-Id, no cookies — the signature covers the exact request.
    const fetchMock = mockFetch(new Response('', { status: 200 }));

    await uploadToPresignedUrl('https://s3.test/put?sig=1', 'x', 'image/png');

    const [, init] = callOf(fetchMock);
    expect(Object.keys(init.headers as Record<string, string>)).toEqual([
      'Content-Type',
    ]);
    expect(init.credentials).toBeUndefined();
  });

  it('forwards a Blob body unchanged', async () => {
    const fetchMock = mockFetch(new Response('', { status: 200 }));
    const body = new Blob(['binary'], { type: 'application/octet-stream' });

    await uploadToPresignedUrl('https://s3.test/put?sig=1', body, body.type);

    const [, init] = callOf(fetchMock);
    expect(init.body).toBe(body);
  });

  it('throws with the status and body text on a non-2xx response', async () => {
    mockFetch(
      new Response('<Error>SignatureDoesNotMatch</Error>', {
        status: 403,
        statusText: 'Forbidden',
      }),
    );

    await expect(
      uploadToPresignedUrl('https://s3.test/put?sig=1', 'x', 'text/markdown'),
    ).rejects.toThrow(/403 Forbidden - <Error>SignatureDoesNotMatch<\/Error>/);
  });
});

describe('fetchPresignedText', () => {
  it('returns the response body text', async () => {
    mockFetch(new Response('hello world', { status: 200 }));

    await expect(fetchPresignedText('https://s3.test/get?sig=1')).resolves.toBe(
      'hello world',
    );
  });

  it('throws on a non-2xx response', async () => {
    mockFetch(
      new Response('NoSuchKey', { status: 404, statusText: 'Not Found' }),
    );

    await expect(fetchPresignedText('https://s3.test/get?sig=1')).rejects.toThrow(
      /404.*NoSuchKey/s,
    );
  });
});

describe('fetchPresignedBlob', () => {
  it('returns the response body as a Blob', async () => {
    mockFetch(new Response('pdf-bytes', { status: 200 }));

    const blob = await fetchPresignedBlob('https://s3.test/get?sig=1');
    expect(blob).toBeInstanceOf(Blob);
    // jsdom's Blob has no `.text()`, so assert the carried payload by size.
    expect(blob.size).toBe('pdf-bytes'.length);
  });

  it('throws on a non-2xx response', async () => {
    mockFetch(new Response('denied', { status: 403, statusText: 'Forbidden' }));

    await expect(
      fetchPresignedBlob('https://s3.test/get?sig=1'),
    ).rejects.toThrow(/403/);
  });
});