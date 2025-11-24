import { JobPriority, ToolCategory } from '@/common/enums/enum';
import type { Tool } from '../entities/tools.entity';

export const officialSupportTools: Tool[] = [
  {
    name: 'nessus',
    category: ToolCategory.VULNERABILITIES,
    description:
      "Nessus is the world's No. 1 vulnerability scanning solution. Learn how Tenable customers put it to work in a range of critical situations.",
    logoUrl: '/static/images/nessus.png',
    version: '',
    priority: JobPriority.LOW,
  },
  {
    name: 'AI Assistant',
    category: ToolCategory.ASSISTANT,
    description:
      'OASM Assistant is an AI-powered automation layer for external attack surface management built on Open-ASM. It uses multi-agent architecture with LangGraph to deliver intelligent threat intelligence, vulnerability analysis, and incident response.',
    logoUrl: '/static/images/oasm-assistant.png',
    version: '',
  },
];
