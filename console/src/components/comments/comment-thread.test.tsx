import { server } from '@/test/mocks/node';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import type { CommentResponseDto } from '@/services/apis/gen/queries';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { CommentThread } from './comment-thread';

vi.mock('@/utils/authClient', () => ({
  useSession: () => ({ data: { user: { id: 'me', name: 'Me' } } }),
}));

const comment = (
  id: string,
  extra: Partial<CommentResponseDto> = {},
): CommentResponseDto => ({
  id,
  content: `comment ${id}`,
  type: 'content',
  issueId: 'iss-1',
  isCanEdit: true,
  isCanDelete: true,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  author: { id: 'me', name: 'Me Myself', image: null },
  repComment: null,
  ...extra,
});

const page = (data: CommentResponseDto[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 100,
  hasNextPage: false,
  pageCount: 1,
});

describe('CommentThread', () => {
  it('shows an empty state', async () => {
    server.use(
      http.get('/api/issues/:id/comments', () => HttpResponse.json(page([]))),
    );
    renderWithProviders(
      <CommentThread subject={{ type: 'issue', id: 'iss-1' }} />,
    );
    expect(await screen.findByText(/No activity yet/)).toBeInTheDocument();
  });

  it('renders comments oldest first with reply snippet and system activity lines', async () => {
    server.use(
      http.get('/api/issues/:id/comments', () =>
        HttpResponse.json(
          page([
            comment('c1', {
              type: 'system',
              content: 'Status changed from open to in_progress',
              isCanEdit: false,
              isCanDelete: false,
            }),
            comment('c2', { content: 'first words' }),
            comment('c3', {
              content: 'a reply',
              author: { id: 'other', name: 'Other Person' },
              repComment: {
                id: 'c2',
                snippet: 'first words',
                deleted: false,
                author: { id: 'me', name: 'Me Myself' },
              },
            }),
          ]),
        ),
      ),
    );
    renderWithProviders(
      <CommentThread subject={{ type: 'issue', id: 'iss-1' }} />,
    );

    const activity = await screen.findByTestId('comment-activity');
    expect(activity).toHaveTextContent('Status changed from open to in_progress');
    // System activity lines carry no edit/delete controls.
    expect(activity.querySelector('button')).toBeNull();

    const items = screen.getAllByTestId('comment-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('first words');
    expect(items[1]).toHaveTextContent('Other Person');
    expect(items[1]).toHaveTextContent('Me Myself: first words');
  });

  it('offers edit/delete only on own comments', async () => {
    server.use(
      http.get('/api/issues/:id/comments', () =>
        HttpResponse.json(
          page([
            comment('mine'),
            comment('theirs', {
              author: { id: 'other', name: 'Other Person' },
            }),
          ]),
        ),
      ),
    );
    renderWithProviders(
      <CommentThread subject={{ type: 'issue', id: 'iss-1' }} />,
    );
    await screen.findByText('comment mine');
    expect(screen.getAllByRole('button', { name: 'Edit comment' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1);
  });

  it('posts a comment and refetches', async () => {
    let posted: unknown;
    let list: CommentResponseDto[] = [];
    server.use(
      http.get('/api/vulnerabilities/:id/comments', () =>
        HttpResponse.json(page(list)),
      ),
      http.post('/api/vulnerabilities/:id/comments', async ({ request }) => {
        posted = await request.json();
        list = [comment('new', { content: 'hello there' })];
        return HttpResponse.json(list[0]);
      }),
    );
    const { user } = renderWithProviders(
      <CommentThread subject={{ type: 'vulnerability', id: 'v-1' }} />,
    );
    await screen.findByText(/No activity yet/);
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'hello there');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(posted).toEqual({ content: 'hello there' }));
    expect(await screen.findByText('hello there')).toBeInTheDocument();
  });

  it('edits an own comment', async () => {
    let patched: unknown;
    server.use(
      http.get('/api/issues/:id/comments', () =>
        HttpResponse.json(page([comment('mine')])),
      ),
      http.patch('/api/comments/:id', async ({ request, params }) => {
        patched = { id: params.id, body: await request.json() };
        return HttpResponse.json(comment('mine'));
      }),
    );
    const { user } = renderWithProviders(
      <CommentThread subject={{ type: 'issue', id: 'iss-1' }} />,
    );
    await user.click(await screen.findByRole('button', { name: 'Edit comment' }));
    const box = screen.getByRole('textbox', { name: 'Edit comment text' });
    await user.clear(box);
    await user.type(box, 'changed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(patched).toEqual({ id: 'mine', body: { content: 'changed' } }),
    );
  });
});
