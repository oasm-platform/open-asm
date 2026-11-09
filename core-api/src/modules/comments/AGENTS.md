# comments module

Comment threads on issues and vulnerabilities, stored in one `comments` table.

## Layout

- `comments.controller.ts`: HTTP routes (no prefix on `@Controller()`, so paths hang off the subject).
- `comments.service.ts`: tenant check, author-only edit/delete, event publishing, DTO mapping.
- `entities/comment.entity.ts`: `Comment` entity.
- `dto/comment.dto.ts`: request/response DTOs, `COMMENT_MAX_LENGTH = 10000`.
- `comments.service.spec.ts`: unit tests.

## Public surface

| Route | Permission |
|---|---|
| `GET/POST issues/:issueId/comments` | `workspace.read` / `workspace.write` |
| `GET/POST vulnerabilities/:vulnerabilityId/comments` | `vulnerability.read` / `vulnerability.write` |
| `PATCH/DELETE comments/:id` | workspace membership only (`@WorkspaceAccess()`); the service checks authorship |

Exports `CommentsService`. Events published (via the global `EventBridgeService`):
`issue.comment.created`, `issue.comment.updated`, `vulnerability.comment.created`.
Vulnerability comment updates publish nothing.

## Data model

- **Exclusive arc, not polymorphic type+id**: one nullable FK per subject (`issueId`, `vulnerabilityId`) with `CHK_comments_one_subject` requiring exactly one. Subject deletion cascades in the DB. A new commentable subject means a new FK column, a new CHECK branch, a new `CommentSubject` kind and a migration (which needs user sign-off).
- Soft delete (`deletedAt`). `repCommentId` is a self-reference for replies.
- `isCanEdit` / `isCanDelete` = `false` marks system comments (status changes, automation notes).

## Invariants

- **Tenant scoping is by subject.** An issue has `workspaceId`; a vulnerability reaches its workspace through `asset → target`. Every call runs `assertSubjectInWorkspace` first.
- A comment from another workspace returns **404, never 403**, so ids don't leak (`findOwnEditable` rewrites the error).
- Replies must point to a non-deleted comment on the **same subject**, otherwise 400.
- Lists are oldest first. `baseQuery()` uses `withDeleted()` so a reply can show that its parent was deleted, and then filters the listed rows with `comment.deletedAt IS NULL`. Keep both parts.
- Authors are exposed as `id`, `name` and `image` only (`toAuthor`).

## Coupling

- Registers `Issue` and `Vulnerability` repositories itself and does not import `IssuesModule` / `VulnerabilitiesModule`.
- `issues/issue-activity.ts` writes system comments directly through the `Comment` repository (an `EntityManager` inside the issue transaction), not through this service. If you change the entity, check that file too.
