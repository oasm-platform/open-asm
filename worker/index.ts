import logger from 'node-color-log';
import { Tool } from './tool/tool';

async function main() {
  logger.setDate(() => new Date().toLocaleTimeString());
  new Tool().run();
}

main();
