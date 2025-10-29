/* eslint-disable */

import type { Severity } from '@/common/enums/enum';
import { ToolCategory } from '@/common/enums/enum';
import { randomUUID } from 'crypto';
import { Asset } from '../assets/entities/assets.entity';
import type { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { Tool } from './entities/tools.entity';

export const builtInTools: Tool[] = [
  {
    name: 'subfinder',
    category: ToolCategory.SUBDOMAINS,
    description:
      'Subfinder is a subdomain discovery tool that returns valid subdomains for websites, using passive online sources.',
    logoUrl:
      'https://raw.githubusercontent.com/projectdiscovery/subfinder/refs/heads/main/static/subfinder-logo.png',
    command:
      '(echo {{value}} && subfinder -duc -d {{value}}) | dnsx -duc -a -aaaa -cname -mx -ns -soa -txt -resp',
    parser: (result: string) => {
      const parsed = {};
      result.split('\n').forEach((line) => {
        const cleaned = line.replace(/\x1B\[[0-9;]*m/g, '').trim();
        const match = cleaned.match(/^([^\[]+)\s+\[([A-Z]+)\]\s+\[(.+)\]$/);
        if (!match) return;

        const [, domain, type, value] = match;
        if (!parsed[domain]) parsed[domain] = {};
        if (!parsed[domain][type]) parsed[domain][type] = [];
        parsed[domain][type].push(value);
      });

      return Object.keys(parsed).map((i) => ({
        id: randomUUID(),
        value: i,
        dnsRecords: parsed[i],
      })) as Asset[];
    },
    version: '2.8.0',
  },
  {
    name: 'httpx',
    category: ToolCategory.HTTP_PROBE,
    description:
      'Httpx is a fast and multi-purpose HTTP toolkit that allows running multiple probes using the retryable http library. It is designed to maintain result reliability with an increased number of threads.',
    logoUrl:
      'https://raw.githubusercontent.com/projectdiscovery/httpx/main/static/httpx-logo.png',
    command:
      'httpx -duc -u {{value}} -status-code -favicon -asn -title -web-server -irr -tech-detect -ip -cname -location -tls-grab -cdn -probe -json -follow-redirects -timeout 10 -threads 100 -silent',
    parser: (result: string) => {
      const parsed = JSON.parse(result);
      return parsed;
    },
    version: '1.7.1',
  },
  {
    name: 'naabu',
    category: ToolCategory.PORTS_SCANNER,
    description:
      'A fast port scanner written in go with a focus on reliability and simplicity. Designed to be used in combination with other tools for attack surface discovery in bug bounties and pentests.',
    logoUrl:
      'https://raw.githubusercontent.com/projectdiscovery/naabu/refs/heads/main/static/naabu-logo.png',
    command: 'naabu -host {{value}} -silent',
    parser: (result: string) => {
      const parsed = result
        .trim()
        .split('\n')
        .filter((i) => i.includes(':'))
        .map((i) => Number(i.split(':')[1].replace('\r', '')))
        .sort();
      return parsed;
    },
    version: '2.3.5',
  },
  {
    name: 'nuclei',
    category: ToolCategory.VULNERABILITIES,
    description:
      'Nuclei is a fast, customizable vulnerability scanner powered by the global security community and built on a simple YAML-based DSL, enabling collaboration to tackle trending vulnerabilities on the internet. It helps you find vulnerabilities in your applications, APIs, networks, DNS, and cloud configurations.',
    logoUrl:
      'https://raw.githubusercontent.com/projectdiscovery/nuclei/refs/heads/dev/static/nuclei-logo.png',
    command: 'nuclei -duc -u {{value}} -j --silent',
    parser: (result: string) => {
      const initialVulnerabilities = result
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            const finding = JSON.parse(line.trim());
            const vulId = randomUUID();
            const filePath = `${vulId}.json`;
            return {
              id: vulId,
              name: finding['info']['name'] as string,
              description: finding['info']['description'] as string,
              severity: finding['info']['severity'].toLowerCase() as Severity,
              tags: finding['info']['tags'] || [],
              references: finding['info']['reference'] || [],
              authors: finding['info']['author'] || [],
              affectedUrl: finding['matched-at'] as string,
              ipAddress: finding['ip'] as string,
              host: finding['host'] as string,
              ports: finding['port'],
              cvssMetric: finding['info']['classification']?.[
                'cvss-metrics'
              ] as string,
              cvssScore: finding['info']['classification']?.[
                'cvss-score'
              ] as number,
              cveId: finding['info']['classification']?.['cve-id'] as string[],
              cweId: finding['info']['classification']?.['cwe-id'] as string[],
              extractorName: finding['extractor-name'] as string,
              extractedResults: finding['extracted-results'] || [],
              filePath,
            };
          } catch (e) {
            console.error('Error processing nuclei result:', e);
            return null;
          }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      const groupedVulnerabilities = new Map<
        string,
        (typeof initialVulnerabilities)[0]
      >();

      for (const vuln of initialVulnerabilities) {
        if (groupedVulnerabilities.has(vuln.name)) {
          const existingVuln = groupedVulnerabilities.get(vuln.name)!;
          existingVuln.tags = [
            ...new Set([...existingVuln.tags, ...vuln.tags]),
          ];
          existingVuln.references = [
            ...new Set([...existingVuln.references, ...vuln.references]),
          ];
          existingVuln.authors = [
            ...new Set([...existingVuln.authors, ...vuln.authors]),
          ];
          existingVuln.extractedResults = [
            ...new Set([
              ...existingVuln.extractedResults,
              ...vuln.extractedResults,
            ]),
          ];
        } else {
          groupedVulnerabilities.set(vuln.name, { ...vuln });
        }
      }

      const data = Array.from(
        groupedVulnerabilities.values(),
      ) as Vulnerability[];
      return data;
    },

    version: '3.4.7',
  },
];
