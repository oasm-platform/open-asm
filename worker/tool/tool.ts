import logger from "node-color-log";
import coreApi from "../services/core-api";
import { WorkerJoinDtoWorkerNameEnum } from "../services/core-api/api";
import runCommand from "./runCommand";

interface Job {
  jobId: string;
  value: string;
  workerName: string;
  command: string;
}

export class Tool {
  private queue: Job[] = [];
  public static workerId: string | null = null;
  public static token: string | null = null;
  public static command: string | null = null;
  private readonly maxJobsQueue = Number(process.env.MAX_JOBS) || 10;
  private readonly workerName = process.env.NAME as string;

  public async run() {
    await this.connectToCore();
    this.alive();
    try {
      this.pullJobsContinuously();
    } catch (e) {
      throw new Error();
    }
  }

  private async alive() {
    setInterval(async () => {
      try {
        await coreApi.workersControllerAlive({
          token: Tool.token!,
        });
      } catch (error: any) {
        if (error?.response?.status === 401) {
          logger.warn("Token unauthorized. Reconnecting...");
          await this.connectToCore();
        }
      }
    }, 5000);
  }
  /**
   * Validates and connects worker via SSE, waits until workerId is set.
   */
  private async connectToCore() {
    if (
      !Object.values(WorkerJoinDtoWorkerNameEnum).includes(
        this.workerName as WorkerJoinDtoWorkerNameEnum
      )
    ) {
      const accepted = Object.values(WorkerJoinDtoWorkerNameEnum).join(", ");
      throw new Error(
        `Invalid worker name "${this.workerName}". Accepted values: ${accepted}`
      );
    }

    const worker: any = await coreApi.workersControllerJoin({
      token: process.env.TOKEN!,
      workerName: this.workerName as WorkerJoinDtoWorkerNameEnum,
    });
    Tool.workerId = worker.id;
    Tool.token = worker.token;
    logger.success(`CONNECTED ✅ WorkerId: ${Tool.workerId}`);
    // Wait until Tool.workerId is set (by SSE handler)
    await this.waitUntil(() => !!Tool.workerId, 1000);
  }

  /**
   * Periodically pulls jobs from core if the queue isn't full.
   */
  private async pullJobsContinuously() {
    logger.info(`[${this.workerName?.toUpperCase()}] - Start pulling jobs...`);
    while (true) {
      try {
        if (this.queue.length < this.maxJobsQueue) {
          const job = (await coreApi.jobsRegistryControllerGetNextJob(
            Tool.workerId!
          )) as Job;
          if (job) {
            this.queue.push(job);
            this.jobHandler(job);
          }
        }
      } catch (err) {
        logger.error("Cannot get next job");
      }
      await this.sleep(2000);
    }
  }

  /**
   * Handles a job and reports result to core.
   */
  private async jobHandler(job: Job) {
    const data = await this.commandExecution(job.command, job.value);
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
    } catch (e) {}
    return;
  }

  private async commandExecution(
    commandPattern: string,
    value: string
  ): Promise<string> {
    const command = commandPattern
      .replace(/{{value}}/g, value)
      .replace(/{{workerId}}/g, Tool.workerId!);

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
