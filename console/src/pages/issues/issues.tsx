import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ListIssues } from './list-issues';

const Issues = () => {
  const navigate = useNavigate();
  return (
    <Page
      title="Issues"
      header={
        <div className="flex justify-end">
          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => navigate('/issues/create')}
          >
            <Plus className="h-4 w-4" />
            Create Issue
          </Button>
        </div>
      }
    >
      <ListIssues />
    </Page>
  );
};

export default Issues;
