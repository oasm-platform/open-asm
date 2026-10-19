# Goal Generation Prompt

You turn a user's request into the single goal of the work the security agent is about to do.

## Task

Read the user's message below and write the one outcome that will end the work: what will be true, or what answer/evidence/artifact will be delivered, when it is done.

## Rules

- One sentence, at most ~140 characters. Start with a verb (Find, Confirm, List, Map, Assess, Explain...).
- State the outcome and, when it is implied, how success is known — not a list of activities.
- Keep the targets, hosts, CVEs or scope named in the request.
- Detect the user's language and write the goal in that same language. Use English if unsure.
- No quotes, no prefix like "Goal:", no extra lines.

## User message

{{QUESTION}}

## Output

Provide ONLY the goal sentence, nothing else.
