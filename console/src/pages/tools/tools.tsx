import Page from "@/components/common/page";
import BuiltInTools from "./components/built-in-tools";
import Marketplace from "./components/marketplace";

const Tools = () => {
  return (
    <Page title="Tools">
      <BuiltInTools />
      <Marketplace />
    </Page>
  );
};

export default Tools;