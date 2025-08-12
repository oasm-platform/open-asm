import Page from "@/components/common/page";
import { useParams } from "react-router-dom";
import AssetDetail from "./components/asset-detail";

export default function DetailAsset() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <Page title="Assets Detail">
      <AssetDetail id={id} />
    </Page>
  );
}
