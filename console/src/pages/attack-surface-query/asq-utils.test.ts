import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  asqErrorOf,
  cellText,
  columnsOf,
  DEFAULT_QUERY,
  flattenRow,
  nextPageBatch,
  parseQueryText,
} from './asq-utils';

describe('parseQueryText', () => {
  it('accepts the default query', () => {
    expect(parseQueryText(DEFAULT_QUERY).ok).toBe(true);
  });

  it('reports invalid JSON and a missing queries object', () => {
    expect(parseQueryText('{').ok).toBe(false);
    expect(parseQueryText('[]')).toEqual({ ok: false, message: 'The query must be a JSON object' });
    expect(parseQueryText('{"queries": []}').ok).toBe(false);
  });
});

describe('asqErrorOf', () => {
  it('reads the ASQ error body of a failed request', () => {
    const body = { error: { code: 'INVALID_QUERY', message: '1 issue(s)', issues: [{ path: 'queries.a.from', code: 'UNKNOWN_RESOURCE', message: 'x' }] } };
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      data: body,
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    expect(asqErrorOf(error)).toEqual(body.error);
  });

  it('falls back to the message', () => {
    expect(asqErrorOf(new Error('boom'))).toEqual({ code: 'ERROR', message: 'boom' });
  });
});

describe('rows', () => {
  it('flattens nested rows and puts ids last', () => {
    const rows = [flattenRow({ id: 's1', port: 443, host: { id: 'h1', value: 'a.example.com' } })];
    expect(rows[0]).toEqual({ id: 's1', port: 443, 'host.id': 'h1', 'host.value': 'a.example.com' });
    expect(columnsOf(rows)).toEqual(['port', 'host.value', 'id', 'host.id']);
  });

  it('does not add a column for a relation that is null on some rows', () => {
    const rows = [
      flattenRow({ id: 's1', http: { title: 'Admin' } }),
      flattenRow({ id: 's2', http: null }),
    ];
    expect(columnsOf(rows)).toEqual(['http.title', 'id']);
  });

  it('renders included lists by their first field', () => {
    expect(cellText([{ id: 't', name: 'nginx' }, { id: 'u', name: 'php' }])).toBe('nginx, php');
    expect(cellText(null)).toBe('');
    expect(cellText(true)).toBe('true');
  });
});

describe('nextPageBatch', () => {
  it('keeps only the paged query, adds its cursor and forces interactive mode', () => {
    const batch = { window: { since: 'now-5d' }, queries: { a: { from: 'hosts' }, b: { from: 'services' } }, options: { mode: 'report' } };
    expect(nextPageBatch(batch, 'b', 'c1')).toEqual({
      window: { since: 'now-5d' },
      queries: { b: { from: 'services', cursor: 'c1' } },
      options: { mode: 'interactive' },
    });
  });
});
