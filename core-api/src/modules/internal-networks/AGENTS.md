# internal-networks module

Named private networks inside a workspace. Workers attach to one and report their network interfaces. Users can then turn interface CIDRs into scan targets.

## Layout

- `internal-networks.controller.ts`: `/internal-networks` routes.
- `internal-networks.service.ts`: CRUD, interface listing, `createTargetsFromInterfaces`.
- `entities/internal-network.entity.ts`, `entities/network-interface.entity.ts`.
- `dtos/`: request/response DTOs. The list queries extend `GetManyBaseQueryParams`, whose `sortBy` must match `SAFE_SORT_IDENTIFIER` (the service interpolates it into `ORDER BY`).

## Public surface

| Route | Permission |
|---|---|
| `GET /internal-networks`, `GET :id`, `GET :id/network-interfaces` | `network.read` |
| `POST /internal-networks`, `PATCH :id`, `DELETE :id` | `network.write` **plus workspace owner** |
| `POST /internal-networks/targets` | `target.write` **plus owner** of every affected workspace |

Exports `InternalNetworksService` (no current consumer). Events: `network.created`, `network.deleted` (via `@PublishEvent`). Update publishes nothing.
Workers attach over gRPC with `WorkersService/ConnectInternalNetwork`, which is implemented in the workers module and not here.

## Data model

- `internal_networks`: `workspaceId` FK with `ON DELETE CASCADE`. `createdBy` FK to `users`, no cascade option.
- `network_interfaces`: belongs to `worker` and `internalNetwork`, both `ON DELETE CASCADE`. Unique `(internalNetworkId, gatewayMac, cidr)`, which `WorkersService.connectInternalNetwork` relies on for its `INSERT ... orIgnore()`.
- Deleting a network cascades in the DB to its interfaces, to `targets.internalNetworkId` (**the targets are deleted**) and to `workers.internalNetworkId` (**the worker rows are deleted**).

## Invariants

- Writes check `WorkspacesService.getWorkspaceByIdAndOwner` in addition to the permission key. A non-owner member who holds `network.write` (even through the Admin group) gets 403 "You are not the owner of this workspace".
- `update` and `delete` load the network by `id` alone and check ownership of **the network's** workspace, not the `X-Workspace-Id` one. Reads filter by `id` and the request `workspaceId`.
- `createTargetsFromInterfaces` ignores the request workspace. It derives each workspace from interface → network and calls `TargetsService.createMultipleTargets(..., internalNetworkId, TargetSource.INTERNAL_NETWORK)` once per network. Targets with an `internalNetworkId` skip the private-IP rejection in `TargetsService`.
- `GET :id/network-interfaces` returns `targetId` when a target with `value = cidr` already exists in the same network.
- Responses expose the creator only as `id`, `name`, `image`.

## Coupling

- Imports `WorkspacesModule` (it is also global). `TargetsService` comes from the global `TargetsModule`.
- `WorkersModule` registers `InternalNetwork` and `NetworkInterface` and writes both tables directly (`connectInternalNetwork`). `Target` and `WorkerInstance` carry FKs to `internal_networks`. A schema change here touches those entities too.

## Testing

`internal-networks.service.spec.ts` covers CRUD, the owner checks, listing and target creation. `internal-networks.controller.spec.ts` checks the permission metadata.
