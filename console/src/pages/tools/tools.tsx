import Page from "@/components/common/page";
import BuiltInTools from "./components/built-in-tools";
import Marketplace from "./components/marketplace";

const Tools = () => {
  // Otherwise show the main tools page
  return (
    <Page title="Tools">
      <BuiltInTools />
      <Marketplace />
    </Page>
  );
};

export default Tools;