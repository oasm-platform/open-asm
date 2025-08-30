import Page from "@/components/common/page";
import BuiltInTools from "./built-in-tools";
import Marketplace from "./marketplace";

const Tools = () => {
  return (
    <Page title="Tools">
      <BuiltInTools />
      <Marketplace />
    </Page>
  );
};

export default Tools;