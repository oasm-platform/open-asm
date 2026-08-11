import { useAsset } from '../context/asset-context';
import AssetGraph from './graph-view';

export function GraphTab() {
  const { targetId } = useAsset();
  return <AssetGraph targetId={targetId} />;
}
