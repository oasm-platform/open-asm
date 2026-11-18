import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PromptRegistry } from './prompt-registry.util';

describe('PromptRegistry', () => {
  let root: string;
  let dir: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-registry-'));
    dir = path.join(root, 'prompts');
    fs.mkdirSync(path.join(dir, 'default'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You help {{name}}.');
    fs.writeFileSync(path.join(dir, 'default', 'Plan.md'), 'Plan first.');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a prompt');
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('finds .md files in subfolders, whatever the case of the name', () => {
    const prompts = PromptRegistry.forDirectory(dir);

    expect(prompts.render('system.md')).toBe('You help {{name}}.');
    expect(prompts.render('PLAN.md')).toBe('Plan first.');
  });

  it('renders the template with Mustache when given data', () => {
    expect(PromptRegistry.forDirectory(dir).render('SYSTEM.md', { name: 'Ana' }))
      .toBe('You help Ana.');
  });

  it('returns an empty prompt for a name it does not hold', () => {
    const prompts = PromptRegistry.forDirectory(dir);

    expect(prompts.render('notes.txt')).toBe('');
    expect(prompts.render('MISSING.md', { name: 'Ana' })).toBe('');
  });

  it('reads a directory once per process', () => {
    const first = PromptRegistry.forDirectory(dir);
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'changed on disk');

    const again = PromptRegistry.forDirectory(path.join(dir, '.'));

    expect(again).toBe(first);
    expect(again.render('SYSTEM.md')).toBe('You help {{name}}.');
  });

  it('holds no prompt when the directory is missing', () => {
    expect(
      PromptRegistry.forDirectory(path.join(root, 'absent')).render('SYSTEM.md'),
    ).toBe('');
  });
});
