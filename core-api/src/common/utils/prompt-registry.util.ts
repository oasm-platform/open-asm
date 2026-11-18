import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import * as path from 'path';

const logger = new Logger('PromptRegistry');

/**
 * Mustache prompt templates read from a directory of `.md` files, looked up
 * by file name whatever its case. Subfolders are read too, since Nest's asset
 * copy may nest the files. Each directory is read once per process and shared
 * by every service that asks for it.
 */
export class PromptRegistry {
  private static readonly byDirectory = new Map<string, PromptRegistry>();

  private constructor(private readonly templates: ReadonlyMap<string, string>) {}

  static forDirectory(dir: string): PromptRegistry {
    const key = path.resolve(dir);
    let registry = PromptRegistry.byDirectory.get(key);
    if (!registry) {
      registry = new PromptRegistry(readTemplates(key, new Map()));
      PromptRegistry.byDirectory.set(key, registry);
    }
    return registry;
  }

  /**
   * The template rendered with `data`, or as written without it. An unknown
   * name logs a warning and yields an empty prompt.
   */
  render(fileName: string, data?: Record<string, unknown>): string {
    const template = this.templates.get(fileName.toLowerCase());
    if (template === undefined) {
      logger.warn(`Prompt not found: ${fileName}`);
      return '';
    }
    return data ? Mustache.render(template, data) : template;
  }
}

function readTemplates(dir: string, into: Map<string, string>): Map<string, string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    logger.error(`Failed to read prompts directory ${dir}`, error);
    return into;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      readTemplates(fullPath, into);
    } else if (entry.name.endsWith('.md')) {
      try {
        into.set(entry.name.toLowerCase(), fs.readFileSync(fullPath, 'utf-8'));
      } catch (error) {
        logger.error(`Failed to load prompt ${entry.name}`, error);
      }
    }
  }
  return into;
}
