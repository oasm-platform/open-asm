---
name: api-development
description: Develop and modify REST APIs in the core-api with strict adherence to project standards, DTO patterns, and automated validation. Use when creating new APIs or modifying existing ones in the backend.
---

# API Development & Modification

Building APIs in this codebase is really about balancing consistency with flexibility. The key insight here is that we're not just writing code that works - we're creating interfaces that become part of the system's contract with the frontend and other services.

## Understanding the API Contract

When you're building a new API, think about the inputs and outputs as your primary contract. The beauty of this approach is that by being explicit about data types, validation rules, and response shapes upfront, you're essentially documenting the API as you build it. For existing APIs, the challenge is usually around backward compatibility - you're not just adding features, you're maintaining trust with existing clients.

The performance considerations are worth highlighting because they often get overlooked. Pagination isn't just about handling large datasets later - if you design with it in mind from the start, you avoid the painful retrofit later. Same goes for caching strategies; knowing that certain endpoints will be hit frequently should influence how you structure your service layer.

## Architecture Patterns That Matter

The controller-service separation here isn't bureaucratic overhead - it's about cognitive load. Controllers handle the translation between HTTP and your domain logic, while services own the business rules. This keeps each layer focused and testable. The rule about declaring new endpoints before `/:id` routes isn't arbitrary; it prevents routing conflicts that can be surprisingly tricky to debug.

DTOs are where this really shines. Rather than exposing your entity structure directly, you're creating purpose-built interfaces. The `class-validator` integration means you get validation at the boundary, which pushes errors back to clients immediately rather than letting them bubble up through your business logic.

## Testing as Design Validation

The emphasis on service tests isn't just about catching bugs - it's about proving your business logic works in isolation. When you mock external dependencies and test with UUID v4 generators, you're creating a controlled environment that validates your core logic. The 80% coverage target isn't a bureaucratic requirement; it's about having confidence that your business rules handle the edge cases that users will inevitably encounter.

## The Frontend Integration Loop

One thing that's easy to miss is the console API generation step. When DTOs change, the `task console:gen-api` command ensures the frontend types stay in sync. This isn't just convenience - it catches contract mismatches early and maintains that consistency between backend expectations and frontend usage.

## Practical Considerations

The endpoint naming conventions (plural nouns, hierarchical structure) aren't just style preferences. They create a predictable API surface that reduces cognitive load for frontend developers and makes the API more discoverable. The workspace handling with `getWorkspaceId: true` is particularly important in multi-tenant scenarios where you need to ensure proper data isolation.

The user data exposure rule reflects real privacy considerations - limiting responses to `id`, `name`, `image` isn't restrictive, it's defensive programming that prevents accidental data leaks. This kind of constraint becomes invaluable as the codebase grows and more developers contribute to it.
