import { Tool } from "./tool/tool";

async function main() {
  const tool = new Tool();
  await tool.connect();
}

main();
