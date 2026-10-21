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
 * workspace's own in-scope targets (discovery, scanning, verification). Each
 * entry is a sample pentest scenario playbook: a full task the agent can carry
 * out end to end, phrased without naming any specific tool. Scenarios stay on
 * the external attack surface: recon, port and service scanning, web app
 * scanning.
 */
export const AGENT_PROMPT_GROUPS: PromptGroup[] = [
  {
    id: 'recon',
    label: 'External recon',
    icon: Telescope,
    prompts: [
      'Run an external recon pass on my in-scope domains: enumerate subdomains, crawl the live hosts to map their endpoints, collect archived URLs from public sources, then summarize the exposed attack surface',
      'Map the web attack surface of my target: crawl it to depth 3, gather historical paths, and fuzz the top forms to find hidden parameters',
      'Find hidden directories and files on my web asset using a common wordlist, and flag anything that looks like an admin panel, backup or config file',
      'Fingerprint the technologies behind my live host so I can choose the right next steps for it',
      'Check my public web asset and build repositories for leaked credentials and API keys, then report what to rotate',
    ],
  },
  {
    id: 'ports',
    label: 'Ports & services',
    icon: Network,
    prompts: [
      'Scan my public host for open ports, then fingerprint the services on what is open and report what is unexpectedly exposed to the internet',
      'Run a full TCP scan, fingerprint the service versions, and list any service that is end-of-life or outdated',
      'Compare my open ports against the previous scan and highlight new or changed services since then',
      'Report which non-web services are exposed to the internet, and whether those services require authentication',
      'Check my public-facing host for exposed admin panels, debug pages and default installations',
    ],
  },
  {
    id: 'web-scan',
    label: 'Web app pentest',
    icon: ShieldAlert,
    prompts: [
      'Run a vulnerability scan with the critical and high severity templates, then summarize the findings with a fix for each',
      'Baseline scan for common web misconfigurations and rank the results by severity',
      'Scan my web asset for outdated components and known-vulnerable libraries, and report what to upgrade',
      'Test my web server for TLS misconfigurations, missing security headers and exposed config or backup files',
      'Review the APIs exposed by my site for broken authentication and authorization, and report what needs fixing',
    ],
  },
];
