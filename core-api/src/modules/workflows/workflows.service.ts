import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);
  private readonly templatesPath = path.join(__dirname, 'templates');

  /**
   * List all YAML template files in the templates directory
   * @returns Array of YAML file names
   */
  listTemplates(): string[] {
    if (!fs.existsSync(this.templatesPath)) {
      return [];
    }

    const files = fs.readdirSync(this.templatesPath);
    const yamlFiles = files.filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'));
    
    // Log the parsed objects for each YAML file
    yamlFiles.forEach((fileName) => {
      try {
        const parsed = this.parseTemplate(fileName);
        this.logger.log(`Parsed object for ${fileName}: ${JSON.stringify(parsed, null, 2)}`);
      } catch (error) {
        this.logger.error(`Error parsing ${fileName}: ${error.message}`);
      }
    });
    
    return yamlFiles;
  }

  /**
   * Parse a YAML file to object
   * @param fileName Name of the YAML file
   * @returns Parsed YAML object
   */
  parseTemplate(fileName: string): any {
    const filePath = path.join(this.templatesPath, fileName);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template file ${fileName} not found`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(fileContent);
    return parsed as any;
  }
}
