import { TabsList, TabsTrigger } from "@/components/ui/tabs";

type Prop = {
  tabTriggerList: {
    value: string;
    text: string;
  }[];
};

export default function TriggerList({ tabTriggerList }: Prop) {
  return (
    <TabsList className="p-0 rounded-none bg-transparent mt-2 flex gap-2">
      {tabTriggerList.map((e) => (
        <TabsTrigger
          key={e.value}
          value={e.value}
          className="border-input border border-b-0 rounded-none rounded-t p-4 dark:data-[state=active]:bg-secondary data-[state=active]:bg-secondary focus-visible:border-none focus-visible:outline-none focus-visible:ring-0"
        >
          {e.text}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
