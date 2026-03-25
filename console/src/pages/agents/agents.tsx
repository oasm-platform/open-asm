import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ListAgents } from './list-agents';

export default function AgentsPage() {
  const navigate = useNavigate();

  const handleCreateAgent = () => {
    navigate('/agents/create');
  };

  return (
    <Page
      title="Agents"
      header={
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={handleCreateAgent}>
            <Plus className="w-4 h-4 mr-2" />
            Connect Provider
          </Button>
        </div>
      }
    >
      <ListAgents />
    </Page>
  );
}
