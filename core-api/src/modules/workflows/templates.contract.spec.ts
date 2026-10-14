import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { TargetType } from '@/common/enums/enum';
import {
  parseManifestTargetTypes,
  resolveToolTargetTypes,
  triggerTargetType,
} from '../tools/tool-target-types';
import { builtInTools } from '../tools/tools-provider/built-in-tools';
import { jobEntries, normalizeWorkflowContent } from './workflow-graph';

/**
 * Contract of the shipped default workflows (templates/*.yaml), checked
 * against the tools they run: every template must be a valid graph, and every
 * job's tool must be able to scan at least one target type the template is
 * triggered for — otherwise the job could never produce work.
 */
const templatesDir = path.join(__dirname, 'templates');
const manifestPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'resources',
  'connectors',
  'manifest.json',
);

interface Template {
  on?: { target?: string[] };
  jobs?: Record<string, { run: string }>;
}

const toolTargetTypes = (): Map<string, TargetType[]> => {
  const byName = new Map<string, TargetType[]>();
  for (const tool of builtInTools) {
    byName.set(tool.name, resolveToolTargetTypes(tool));
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    connectors: Array<{ slug: string; targetTypes?: unknown }>;
  };
  for (const connector of manifest.connectors) {
    byName.set(
      connector.slug,
      parseManifestTargetTypes(connector.targetTypes).targetTypes,
    );
  }
  return byName;
};

const templateFiles = fs
  .readdirSync(templatesDir)
  .filter((file) => /\.ya?ml$/.test(file));

describe('default workflow templates', () => {
  const tools = toolTargetTypes();

  it.each(templateFiles)('%s is a valid graph of known tools', (file) => {
    const content = yaml.load(
      fs.readFileSync(path.join(templatesDir, file), 'utf8'),
    ) as Template;
    expect(() => normalizeWorkflowContent(content as never)).not.toThrow();

    const triggerTypes = (content.on?.target ?? [])
      .map(triggerTargetType)
      .filter((type): type is TargetType => type !== undefined);

    for (const [, job] of jobEntries(content.jobs)) {
      const supported = tools.get(job.run);
      expect(supported).toBeDefined();
      if (triggerTypes.length > 0) {
        expect(triggerTypes.some((type) => supported!.includes(type))).toBe(
          true,
        );
      }
    }
  });

  it('scans repositories only after they were synced', () => {
    const content = yaml.load(
      fs.readFileSync(path.join(templatesDir, 'repository_scan.yaml'), 'utf8'),
    ) as Template;
    expect(content.on?.target).toEqual(['git_org.synced']);
    expect(tools.get('gitleaks')).toEqual([TargetType.GIT_ORG]);
  });

  it('scans repositories for secrets and for vulnerable dependencies', () => {
    const content = yaml.load(
      fs.readFileSync(path.join(templatesDir, 'repository_scan.yaml'), 'utf8'),
    ) as Template;
    const runs = jobEntries(content.jobs).map(([, job]) => job.run);
    expect(runs).toEqual(expect.arrayContaining(['gitleaks', 'trivy']));
    expect(tools.get('trivy')).toEqual([TargetType.GIT_ORG]);
  });
});
