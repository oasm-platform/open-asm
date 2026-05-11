# Remote CLI Feature — Design Specification

**Date:** 2026-05-11
**Status:** Approved

---

## 1. Overview

Remote CLI cho phép operator (từ console frontend) kết nối interactive shell đến một worker cụ thể trong workspace. Dữ liệu realtime (stdout/stderr với ANSI codes) được stream qua SSE đến console.

---

## 2. Architecture

```
┌─────────┐    REST/SSE    ┌──────────┐    gRPC bi-di    ┌───────┐
│ Console │◄──────────────►│  Core    │◄────────────────►│Worker │
│ (React) │    SSE stream  │   API    │   CliSession     │ (Go)  │
└─────────┘                 └────┬─────┘   stream        └───────┘
                                 │
                              Redis
                          (session state)
```

**Flow:**
1. Console gửi command qua REST → Core
2. Core forward command qua gRPC bi-di stream → Worker
3. Worker exec command với PTY → stream raw bytes (ANSI preserved) về Core
4. Core broadcast qua SSE → Console

---

## 3. Proto Definition

### File: `core-api/src/proto/workers.proto`

Add new service and messages:

```protobuf
service CliService {
  rpc CliSession(stream CliCommand) returns (stream CliOutput);
}

message CliCommand {
  string session_id = 1;
  string command = 2;
  CliCommandType type = 3;
  int32 cols = 4;
  int32 rows = 5;
}

enum CliCommandType {
  EXEC = 0;
  RESIZE = 1;
  CANCEL = 2;
}

message CliOutput {
  string session_id = 1;
  CliOutputType type = 2;
  bytes data = 3;
  int32 exit_code = 4;
}

enum CliOutputType {
  STDOUT = 0;
  STDERR = 1;
  EXIT = 2;
  CONNECTED = 3;
  DISCONNECTED = 4;
  ERROR = 5;
}
```

---

## 4. Core-api Module

### Location: `core-api/src/modules/cli/`

```
src/modules/cli/
├── cli.controller.ts
├── cli.service.ts
├── cli.gateway.ts          # SSE gateway
├── cli-session.entity.ts
├── dto/
│   ├── create-session.dto.ts
│   ├── send-command.dto.ts
│   └── cli-output.dto.ts
└── cli.module.ts
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cli/sessions` | Tạo session mới (chỉ định worker target) |
| GET | `/cli/sessions/:id/stream` | SSE endpoint — console subscribe output |
| POST | `/cli/sessions/:id/commands` | Gửi command (EXEC, RESIZE, CANCEL) |
| DELETE | `/cli/sessions/:id` | Close session |

### DTOs

**CreateSessionDto:**
```typescript
{
  workerId: string;
  cols?: number;  // default 80
  rows?: number; // default 24
}
```

**SendCommandDto:**
```typescript
{
  command: string;
  type: 'EXEC' | 'RESIZE' | 'CANCEL';
  cols?: number;
  rows?: number;
}
```

**CliOutputDto (SSE):**
```typescript
{
  sessionId: string;
  type: 'stdout' | 'stderr' | 'exit' | 'connected' | 'disconnected' | 'error';
  data?: string;
  exitCode?: number;
}
```

---

## 5. Redis Schema

### Keys

```
cli:sessions:{sessionId}
  → Hash: {
      workerId: string,
      workspaceId: string,
      status: 'active' | 'disconnected' | 'closed',
      cols: number,
      rows: number,
      createdAt: timestamp,
      createdBy: string
    }
  → TTL: 24h (auto cleanup)

cli:worker-sessions:{workerId}
  → Set: [sessionId, ...]
```

---

## 6. Worker Module

### Location: `worker/internal/cli/`

```
internal/cli/
├── session_manager.go
├── session.go
├── pty_handler.go
└── cli_stream.go
```

### Components

**SessionManager:**
- Holds `map[sessionId] *Session`
- Routes `CliCommand` đến correct session
- Handles cleanup on disconnect

**Session:**
- Wraps PTY process
- Stores cols/rows
- Streams output back via channel

**PtyHandler:**
- Spawn bash with PTY
- Handle resize (ioctl TIOCSWINSZ)
- Handle cancel (kill process group)
- Stream stdout/stderr as raw bytes

### Startup Behavior

Worker connects `CliSession` stream ngay khi start (sau khi join thành công). Stream kept alive, auto-reconnect on disconnect.

---

## 7. Failover Behavior

1. Worker disconnect → sends `DISCONNECTED` type
2. Core marks session `disconnected` in Redis
3. Core auto-schedules new worker (same workspace, online)
4. New worker opens stream, sends `CONNECTED`
5. Operator continues on fresh shell (state lost)

---

## 8. Auth/Authz

- Console user must have permission in workspace (existing permission system)
- Core verifies workspace ownership before creating session
- Worker validates via existing worker-token mechanism

---

## 9. SSE Protocol

**Client connects:**
```
GET /cli/sessions/:id/stream
Authorization: Bearer <token>
```

**Server sends events:**
```
event: cli-output
data: {"sessionId":"xxx","type":"stdout","data":"..."}

event: cli-output
data: {"sessionId":"xxx","type":"exit","exitCode":0}
```

**Client sends (POST):**
```json
{"command":"ls -la","type":"EXEC","cols":120,"rows":30}
```

---

## 10. File Changes Summary

### Core-api

| File | Action |
|------|--------|
| `src/proto/workers.proto` | Add CliService |
| `src/modules/cli/` | New module (controller, service, gateway, entity, DTOs) |
| `src/app.module.ts` | Import CliModule |

### Worker

| File | Action |
|------|--------|
| `internal/cli/` | New package |
| `internal/worker/client.go` | Connect CliSession stream |
| `cmd/cli/root.go` | Add `--cli-stream` flag |

### Generated

| File | Action |
|------|--------|
| `grpc-client/go/workers/` | Regenerate after proto change |

---

## 11. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Worker offline | Return 503, suggest retry later |
| Session not found | Return 404 |
| Unauthorized workspace | Return 403 |
| Worker disconnects mid-command | Send DISCONNECTED, wait for failover |
| No available worker in workspace | Return 503 "No workers available" |
| Invalid command format | Return 400, do not close session |

---

## 12. Testing Strategy

- Unit: SessionManager, PtyHandler, CliService logic
- Integration: Full flow console → core → worker → console
- Manual: Interactive shell with ANSI colors, resize, cancel