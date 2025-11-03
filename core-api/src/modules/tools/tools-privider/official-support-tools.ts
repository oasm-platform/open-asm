import { JobPriority, ToolCategory } from '@/common/enums/enum';
import type { Tool } from '../entities/tools.entity';

export const officialSupportTools: Tool[] = [
    {
        name: 'nessus',
        category: ToolCategory.VULNERABILITIES,
        description: 'Nessus is the world\'s No. 1 vulnerability scanning solution. Learn how Tenable customers put it to work in a range of critical situations.',
        logoUrl:
            '/static/images/nessus.png',
        version: '',
        priority: JobPriority.LOW,
    },
];
