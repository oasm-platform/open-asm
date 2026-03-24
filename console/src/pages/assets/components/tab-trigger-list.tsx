import { TabsList, TabsTrigger } from '@/components/ui/tabs';

type Prop = {
  tabTriggerList: {
    value: string;
    text: string;
    isNew?: boolean;
  }[];
};

export default function TriggerList({ tabTriggerList }: Prop) {
  return (
    <div className="w-full overflow-x-auto scrollbar-hide">
      <TabsList className="rounded-none bg-transparent p-0 flex gap-2 w-max flex-nowrap">
        {tabTriggerList.map((e) => (
          <TabsTrigger
            key={e.value}
            value={e.value}
            className="hover:cursor-pointer h-9 flex-none"
          >
            {e.text}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
