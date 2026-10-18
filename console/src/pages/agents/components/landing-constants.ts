import {
  Bug,
  Gauge,
  Network,
  Radar,
  ShieldAlert,
  Telescope,
  type LucideIcon,
} from 'lucide-react';

export const CONVERSATION_STARTERS = [
  'How can I help secure your application today?',
  'Ready to strengthen your security posture.',
  'What security challenge are you facing?',
  'Let me help you find and fix vulnerabilities.',
  'Ask me anything about application security.',
  'Your AI security assistant is ready.',
  'Need help with a security issue?',
  "What's your security concern today?",
  "I'm listening. Tell me about your security needs.",
  'Your security matters. I am here to help.',
  'Share your security concerns. I am all ears.',
  'I am ready to assist with your security questions.',
  'Tell me what is on your mind regarding security.',
  'I am here and attentive to your security needs.',
  'Your security questions are important to me.',
  'I am tuned in. What security topics interest you?',
];

export interface PromptGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  prompts: string[];
}

/**
 * Ask mode: the agent reads and reasons over workspace data but does not run
 * scans. Every prompt is answerable from data the agent can query (dashboard
 * stats, assets, targets, ports, technologies, TLS certificates,
 * vulnerabilities, issues, scan jobs and workers).
 */
export const ASK_PROMPT_GROUPS: PromptGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Gauge,
    prompts: [
      'Summarize the security posture of this workspace',
      'Break down my security score and what is lowering it',
      'What are the top 5 risks I should fix this week?',
      'Which targets have the most assets and vulnerabilities?',
      'Write an executive security summary I can share with leadership',
    ],
  },
  {
    id: 'attack-surface',
    label: 'Attack surface',
    icon: Radar,
    prompts: [
      'What assets are exposed in this workspace?',
      'Which open ports are most common, and which ones look risky?',
      'Which hosts run outdated or end-of-life technologies?',
      'Find assets that expose admin panels or login pages',
      'List the assets discovered for each of my targets',
    ],
  },
  {
    id: 'vulnerabilities',
    label: 'Vulnerabilities',
    icon: Bug,
    prompts: [
      'Show my critical and high vulnerabilities and how to fix them',
      'Which vulnerabilities have a known CVE?',
      'Prioritize my vulnerabilities by severity and exposure',
      'Explain my riskiest vulnerability with its CVSS score and a fix',
      'Group vulnerabilities by asset so I can assign owners',
    ],
  },
];

/**
 * Agent mode: the agent runs tools on the connected workers and acts on the
 * workspace's own in-scope targets (discovery, scanning, verification). Every
 * prompt maps to the agent-callable connectors (nmap, rustscan, nuclei, nikto,
 * zap, wpscan, katana, gau, arjun, ffuf, dirsearch, gitleaks, trivy) or to
 * `execute_remote_command` on a worker.
 */
export const AGENT_PROMPT_GROUPS: PromptGroup[] = [
  {
    id: 'recon',
    label: 'Recon',
    icon: Telescope,
    prompts: [
      'Discover live hosts and URLs for my targets',
      'Crawl my web assets to map their endpoints',
      'Find historical URLs for my domains from public archives',
      'Discover hidden parameters on my key endpoints',
      'Fuzz for hidden directories and files on my web assets',
    ],
  },
  {
    id: 'ports',
    label: 'Ports & services',
    icon: Network,
    prompts: [
      'Scan my in-scope assets for open ports and services',
      'Run a fast port sweep across my hosts',
      'Fingerprint the service versions on my open ports',
      'Check my hosts for exposed databases or admin services',
      'Compare open ports now against the last scan',
    ],
  },
  {
    id: 'web-scan',
    label: 'Web scan',
    icon: ShieldAlert,
    prompts: [
      'Run a Nuclei scan against my web assets',
      'Scan my main domain for common web vulnerabilities',
      'Check my WordPress sites for known issues',
      'Run a baseline web app scan on my in-scope sites',
      'Scan my web servers for misconfigurations',
    ],
  },
];
