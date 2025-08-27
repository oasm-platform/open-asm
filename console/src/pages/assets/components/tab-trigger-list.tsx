import { TabsList, TabsTrigger } from "@/components/ui/tabs";

type Prop = {
  tabTriggerList: {
    value: string;
    text: string;
  }[];
};

export default function TriggerList({ tabTriggerList }: Prop) {
  return (
    <TabsList className="rounded-none bg-transparent my-2 flex gap-2">
      {tabTriggerList.map((e) => (
        <TabsTrigger
          key={e.value}
          value={e.value}
          className="hover:cursor-pointer"
        >
          {e.text}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
