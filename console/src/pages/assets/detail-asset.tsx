import Page from "@/components/common/page";
import { useParams } from "react-router-dom";
import AssetDetail from "./components/asset-detail";

export default function DetailAsset() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <Page isShowButtonGoBack>
      <AssetDetail id={id} />
    </Page>
  );
}
