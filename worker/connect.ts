import { workersControllerAlive } from "./services/core-api/alive";
import { WorkersControllerAliveParamsEnum } from "./services/core-api/api";
import { WorkerId } from "./services/core-api/workerId";

export default async function connect(): Promise<string> {
  const workerName = process.env.NAME as string;
  if (
    !Object.values(WorkersControllerAliveParamsEnum).includes(
      workerName as WorkersControllerAliveParamsEnum
    )
  ) {
    const acceptedTypes = Object.values(WorkersControllerAliveParamsEnum).join(
      ", "
    );
    throw new Error(
      `workerName ${workerName} is not part of accepted types: ${acceptedTypes}`
    );
  }
  // Connect stream sse for worker
  workersControllerAlive(workerName);
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const { workerId } = WorkerId;
      if (workerId) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
  const { workerId } = WorkerId;
  return workerId;
}
