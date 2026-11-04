import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Workflow files: the data a tool takes and finds, and the triggers of a
 * project workflow in its `on:` block.
 *
 * All-in-one: the new column and both backfills, in this single migration.
 *
 * 1. `jobs.inputs` (jsonb, nullable): the inputs a connector job was created
 *    for, so a job of a web service sends its URL as `target` instead of the
 *    bare host. Existing jobs stay NULL and keep receiving `{ target: <asset> }`.
 *
 * 2. `tools.categories`: every category entry without `inputs` gets the
 *    inputs and outputs its category always had (see `defaultInputs` and
 *    `defaultProduces` in tools/tool-io.ts). Built-in and connector tools are
 *    rewritten by the sync at boot anyway; this covers tools created through
 *    a provider, which nothing re-syncs.
 *
 * 3. Project workflow triggers move into the workflow file. Each project
 *    workflow's `on:` is rebuilt from its `project_workflow_triggers` rows:
 *    `schedule: [{ cron }]` and `assetsAdded: { … }`, replacing whatever `on`
 *    the file had (a `schedule` string left from asset groups, `target`
 *    events a project workflow never ran on). The rows stay: they keep
 *    whether a trigger is on, when it last fired and its BullMQ scheduler id,
 *    so no schedule is re-registered. A workflow bound to a project without
 *    being its own (none is created that way any more) is copied into the
 *    project first when it has triggers, so its schedule cannot leak into
 *    another project bound to the same file.
 *
 * SCOPE NOTE: `typeorm migration:generate` also emitted the pre-existing drift
 * on `tool_config_profiles`, `jobs`, `discovered_urls`, `workspace_*`,
 * `agent_*`, `audit_events`, `integrations` and `workflows` documented in
 * 1791780166474-AddIntegrationCapabilities. It is removed here.
 */
export class WorkflowInputsAndTriggers1793765491615 implements MigrationInterface {
  name = 'WorkflowInputsAndTriggers1793765491615';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Job inputs.
    await queryRunner.query(`ALTER TABLE "jobs" ADD "inputs" jsonb`);

    // 2. Inputs and outputs of tools stored before they existed.
    await queryRunner.query(`
      UPDATE "tools" t
         SET "categories" = (
           SELECT jsonb_agg(
                    CASE WHEN c ? 'inputs' THEN c ELSE c || jsonb_build_object(
                      'inputs', CASE c->>'name'
                        WHEN 'subdomains' THEN '["target"]'::jsonb
                        WHEN 'ports_scanner' THEN '["host"]'::jsonb
                        WHEN 'http_probe' THEN '["service"]'::jsonb
                        WHEN 'screenshot' THEN '["web"]'::jsonb
                        WHEN 'url_discovery' THEN '["web"]'::jsonb
                        ELSE CASE
                          WHEN jsonb_array_length(c->'targetTypes') > 0
                           AND NOT EXISTS (
                             SELECT 1 FROM jsonb_array_elements_text(c->'targetTypes') tt
                              WHERE tt <> 'GIT_ORG')
                          THEN '["repository"]'::jsonb
                          ELSE '["host"]'::jsonb
                        END
                      END,
                      'produces', CASE c->>'name'
                        WHEN 'subdomains' THEN '["host"]'::jsonb
                        WHEN 'ports_scanner' THEN '["service"]'::jsonb
                        WHEN 'http_probe' THEN '["web"]'::jsonb
                        WHEN 'screenshot' THEN '[]'::jsonb
                        WHEN 'url_discovery' THEN '["url"]'::jsonb
                        ELSE '["vulnerability"]'::jsonb
                      END)
                    END
                    ORDER BY e.ord)
             FROM jsonb_array_elements(t."categories") WITH ORDINALITY AS e(c, ord)
         )
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(t."categories") c
          WHERE NOT (c ? 'inputs'))
    `);

    // 3a. A shared workflow with project triggers becomes the project's own.
    const shared: Array<{ bindingId: string; projectId: string; workflowId: string }> =
      await queryRunner.query(`
        SELECT pw.id AS "bindingId", pw."projectId", w.id AS "workflowId"
          FROM project_workflows pw
          JOIN workflows w ON w.id = pw."workflowId"
         WHERE w."filePath" <> 'group-' || pw."projectId" || '.yaml'
           AND w."filePath" NOT LIKE 'project-' || pw."projectId" || '-%'
           AND EXISTS (SELECT 1 FROM project_workflow_triggers t
                        WHERE t."projectWorkflowId" = pw.id)`);
    for (const { bindingId, projectId, workflowId } of shared) {
      const copyId = randomUUID();
      await queryRunner.query(
        `INSERT INTO workflows (id, name, content, "filePath", "isCanDelete", "isCanEdit", "createdBy", "workspaceId")
         SELECT $1, name, content, $2, true, true, "createdBy", "workspaceId"
           FROM workflows WHERE id = $3`,
        [copyId, `project-${projectId}-${randomUUID()}.yaml`, workflowId],
      );
      await queryRunner.query(
        `UPDATE project_workflows SET "workflowId" = $1 WHERE id = $2`,
        [copyId, bindingId],
      );
    }

    // 3b. Every project workflow's `on:` from its trigger rows.
    await queryRunner.query(`
      WITH owned AS (
        SELECT pw.id AS binding_id, w.id AS workflow_id
          FROM project_workflows pw
          JOIN workflows w ON w.id = pw."workflowId"
         WHERE w."filePath" = 'group-' || pw."projectId" || '.yaml'
            OR w."filePath" LIKE 'project-' || pw."projectId" || '-%'
      ), defined AS (
        SELECT o.workflow_id,
               jsonb_strip_nulls(jsonb_build_object(
                 'schedule', (SELECT jsonb_agg(jsonb_build_object('cron', t.cron) ORDER BY t."createdAt")
                                FROM project_workflow_triggers t
                               WHERE t."projectWorkflowId" = o.binding_id AND t.type = 'cron'),
                 'assetsAdded', (SELECT t.config
                                   FROM project_workflow_triggers t
                                  WHERE t."projectWorkflowId" = o.binding_id AND t.type = 'assets_added'
                                  ORDER BY t."createdAt" LIMIT 1)
               )) AS "on"
          FROM owned o
      )
      UPDATE workflows w
         SET content = CASE WHEN d."on" = '{}'::jsonb
                            THEN w.content - 'on'
                            ELSE jsonb_set(w.content, '{on}', d."on") END
        FROM defined d
       WHERE w.id = d.workflow_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 3. The rows still hold every trigger; the files lose their `on:`.
    // Copies made in 3a stay: they are complete workflows of their project.
    await queryRunner.query(`
      UPDATE workflows w
         SET content = w.content - 'on'
        FROM project_workflows pw
       WHERE w.id = pw."workflowId"
         AND (w."filePath" = 'group-' || pw."projectId" || '.yaml'
              OR w."filePath" LIKE 'project-' || pw."projectId" || '-%')
    `);

    // 2.
    await queryRunner.query(`
      UPDATE "tools" t
         SET "categories" = (
           SELECT jsonb_agg(c - 'inputs' - 'produces' ORDER BY e.ord)
             FROM jsonb_array_elements(t."categories") WITH ORDINALITY AS e(c, ord)
         )
    `);

    // 1.
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "inputs"`);
  }
}
