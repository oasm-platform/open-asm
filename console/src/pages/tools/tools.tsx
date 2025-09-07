import Page from "@/components/common/page";
import { useSearchParams } from "react-router-dom";
import BuiltInTools from "./components/built-in-tools";
import Marketplace from "./components/marketplace";

const Tools = () => {
  const [searchParams] = useSearchParams();
  const stage = searchParams.get("stage") ?? "";
  // Otherwise show the main tools page
  const stages = [
    {
      title: "built-in-tools",
      component: <BuiltInTools />,
    },
    {
      title: "marketplace",
      component: <Marketplace />,
    },
  ];
  return (
    <Page title="Tools">
      {stage ? stages.find((item) => item.title === stage)?.component : stages.map((item) => item.component)}
    </Page>
  );
};

export default Tools;