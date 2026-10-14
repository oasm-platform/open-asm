import Page from '@/components/common/page';
import { MemoryManager } from '@/components/memory-manager';
import { SkillsManager } from '@/components/skills-manager';
import LlmConnect from '@/pages/agents/components/llm-connect';
import type { ComponentType } from 'react';

export type AiStudioSettingsSection = 'providers' | 'skills' | 'memory';

const sections: Record<
  AiStudioSettingsSection,
  { title: string; description: string; component: ComponentType }
> = {
  providers: {
    title: 'Providers',
    description: 'Manage your AI models and API connections',
    component: LlmConnect,
  },
  skills: {
    title: 'Skills',
    description: 'Specialized instructions the agent can use to perform tasks',
    component: SkillsManager,
  },
  memory: {
    title: 'Memory',
    description: 'Long-term memory content used by the AI agent',
    component: MemoryManager,
  },
};

export default function AiStudioSettingsPage({
  section,
}: {
  section: AiStudioSettingsSection;
}) {
  const { title, description, component: Component } = sections[section];
  return (
    <Page
      title={title}
      description={description}
      className="w-full max-w-4xl mx-auto"
      permission="agent.read"
    >
      <Component />
    </Page>
  );
}
