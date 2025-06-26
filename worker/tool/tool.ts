import logger from "node-color-log";
import coreApi from "../services/core-api";
import { workersControllerAlive } from "../services/core-api/alive";
import { WorkersControllerAliveParamsEnum } from "../services/core-api/api";
import runCommand from "./runCommand";

interface Job {
  jobId: string;
  value: string;
  workerName: string;
}

export class Tool {
  private queue: Job[] = [];
  public static workerId: string | null = null;
  public static command: string | null = null;
  private readonly maxJobsQueue = Number(process.env.MAX_JOBS) || 10;
  private readonly workerName = process.env.NAME as string;

  public async run() {
    await this.connectToCore();
    try {
      this.pullJobsContinuously();
    } catch (e) {
      throw new Error();
    }
  }

  /**
   * Validates and connects worker via SSE, waits until workerId is set.
   */
  private async connectToCore() {
    if (
      !Object.values(WorkersControllerAliveParamsEnum).includes(
        this.workerName as WorkersControllerAliveParamsEnum
      )
    ) {
      const accepted = Object.values(WorkersControllerAliveParamsEnum).join(
        ", "
      );
      throw new Error(
        `Invalid worker name "${this.workerName}". Accepted values: ${accepted}`
      );
    }

    workersControllerAlive(this.workerName);

    // Wait until Tool.workerId is set (by SSE handler)
    await this.waitUntil(() => !!Tool.workerId, 1000);
  }

  /**
   * Periodically pulls jobs from core if the queue isn't full.
   */
  private async pullJobsContinuously() {
    logger.info(`[${this.workerName?.toUpperCase()}] - Start pulling jobs...`);
    while (true) {
      while (this.queue.length < this.maxJobsQueue) {
        try {
          const job = (await coreApi.jobsRegistryControllerGetNextJob(
            Tool.workerId!
          )) as Job;

          if (!job) break;

          this.queue.push(job);
          this.jobHandler(job);
        } catch (e) {
          logger.error("Error while pulling job");
        }
      }
      await this.sleep(2000); // Pull interval or backoff
    }
  }

  /**
   * Handles a job and reports result to core.
   */
  private async jobHandler(job: Job) {
    const data = await this.commandExecution(Tool.command!, job.value);
    try {
      await coreApi.jobsRegistryControllerUpdateResult(Tool.workerId!, {
        jobId: job.jobId,
        data: {
          raw: data,
        },
      });
      this.queue = this.queue.filter((j) => j.jobId !== job.jobId);

      logger
        .color("green")
        .log(
          `[DONE] - JobId: ${job.jobId} - WorkerId: ${Tool.workerId} - WorkerName: ${this.workerName}`
        );
    } catch (e) {
      logger.color("red").log(e);
    }
  }

  private async commandExecution(
    commandPattern: string,
    value: string
  ): Promise<string> {
    const command = commandPattern
      .replace("{{value}}", value)
      .replace("{{workerId}}", Tool.workerId!);

    logger.color("blue").log(`[RUNNING]: ${command}`);

    try {
      return runCommand(command);
    } catch (error: any) {
      console.error("Command execution error:", error);
      throw new Error(`Failed to execute command: ${error.message}`);
    }
  }

  /**
   * Utility to wait until a condition is met.
   */
  private async waitUntil(
    condition: () => boolean,
    intervalMs: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (condition()) {
          clearInterval(interval);
          resolve();
        }
      }, intervalMs);
    });
  }

  /**
   * Utility sleep function.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
