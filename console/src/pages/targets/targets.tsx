import Page from "@/components/common/page";
import { CreateTarget } from '@/components/ui/create-target';
import { ListTargets } from "./list-targets";

const Targets = () => {
  return (
    <Page title="Targets" header={
      <div className="flex justify-end">
        <CreateTarget />
      </div>
    }>
      <ListTargets />
    </Page>
  );
};

export default Targets;

