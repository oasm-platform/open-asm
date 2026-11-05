/* eslint-disable */

import { DataKind, JobPriority, ToolCategory } from '@/common/enums/enum';
import { randomUUID } from 'crypto';
import { Asset } from '../../assets/entities/assets.entity';
import { TargetType } from '@/common/enums/enum';
import { Tool } from '../entities/tools.entity';
import { categorySpec } from '../tool-categories';

export const builtInTools: Tool[] = [
  {
    name: 'subfinder',
    // Subdomain enumeration only makes sense for a domain.
    categories: [
      categorySpec(ToolCategory.SUBDOMAINS, [TargetType.DOMAIN], {
        inputs: [DataKind.TARGET],
        produces: [DataKind.HOST],
      }),
    ],
    description:
      'Subfinder is a subdomain discovery tool that returns valid subdomains for websites, using passive online sources.',
    logoUrl: '/static/images/subfinder.png',
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
    priority: JobPriority.MEDIUM,
  },
  {
    name: 'httpx',
    // Probes every open port; the ones that answer HTTP become web services.
    categories: [
      categorySpec(ToolCategory.HTTP_PROBE, [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR], {
        inputs: [DataKind.SERVICE],
        produces: [DataKind.WEB],
      }),
    ],
    description:
      'Httpx is a fast and multi-purpose HTTP toolkit that allows running multiple probes using the retryable http library. It is designed to maintain result reliability with an increased number of threads.',
    logoUrl: '/static/images/httpx.png',
    command:
      'httpx -duc -u {{value}} -status-code -favicon -asn -title -web-server -irr -tech-detect -ip -cname -location -tls-grab -cdn -probe -json -follow-redirects -timeout 10 -threads 100 -silent',
    parser: JSON.parse,
    version: '1.7.1',
    priority: JobPriority.MEDIUM,
  },
  {
    name: 'screenshot',
    categories: [
      categorySpec(ToolCategory.SCREENSHOT, [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR], {
        inputs: [DataKind.WEB],
        produces: [],
      }),
    ],
    description: 'Take a screenshot of a website.',
    logoUrl: '/static/images/screenshot.png',
    parser: JSON.parse,
    version: '1.0.0',
    command: 'screenshot {{value}}',
    priority: JobPriority.MEDIUM,
  },
  {
    name: 'naabu',
    categories: [
      categorySpec(ToolCategory.PORTS_SCANNER, [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR], {
        inputs: [DataKind.HOST],
        produces: [DataKind.SERVICE],
      }),
    ],
    description:
      'A fast port scanner written in go with a focus on reliability and simplicity. Designed to be used in combination with other tools for attack surface discovery in bug bounties and pentests.',
    logoUrl: '/static/images/naabu.png',
    command: 'naabu -host {{value}} -silent',
    parser: (result: string) => {
      const parsed = result
        .trim()
        .split('\n')
        .filter((i) => i.includes(':'))
        .map((i) => Number(i.split(':')[1].replace(/\r/g, '')))
        .sort();
      return parsed;
    },
    version: '2.3.5',
    priority: JobPriority.MEDIUM,
  },
];
