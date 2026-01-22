import logger from "node-color-log";
import coreApi from "../services/core-api";
import { ToolCategoryEnum, type Job } from "../services/core-api/api";
import screenshotHandler from "./handlers/screenshot";
import runCommand from "./runCommand";

export class Tool {
  private queue: Job[] = [];
  private processingJobs = new Set<string>(); // Track jobs being processed
  public static workerId: string | null = null;
  public static token: string | null = null;
  public static command: string | null = null;
  private isAliveError = false;
  private readonly maxJobsQueue = Number(process.env.MAX_JOBS) || 10;
  private readonly maxConcurrentJobs =
    Number(process.env.MAX_CONCURRENT_JOBS) || 5;
  private readonly pullInterval = Number(process.env.PULL_INTERVAL) || 1000; // Configurable pull interval
  private isShuttingDown = false;

  public async run() {
    await this.connectToCore();
    this.alive();

    // Track previous status for change detection
    let prevStatus = this.getStatus();

    // Log worker status when values change (check every second)
    setInterval(() => {
      const currentStatus = this.getStatus();
      const statusChanged =
        prevStatus.processingJobs !== currentStatus.processingJobs ||
        prevStatus.queueLength !== currentStatus.queueLength;

      if (
        statusChanged &&
        (currentStatus.processingJobs > 0 || currentStatus.queueLength > 0)
      ) {
        logger.info(
          `Worker ${Tool.workerId} status - Running: ${currentStatus.processingJobs}/${currentStatus.maxConcurrentJobs} jobs | Queue: ${currentStatus.queueLength}/${currentStatus.maxJobsQueue}`,
        );
        prevStatus = { ...currentStatus };
      }
    }, 1000);

    // Handle graceful shutdown
    this.setupGracefulShutdown();

    try {
      // Start job pulling and processing concurrently
      await Promise.all([
        this.pullJobsContinuously(),
        this.processQueueContinuously(),
      ]);
    } catch (e) {
      logger.error("Tool execution failed:", e);
      throw new Error("Tool execution failed");
    }
  }

  private setupGracefulShutdown() {
    const gracefulShutdown = async () => {
      logger.info("Graceful shutdown initiated...");
      this.isShuttingDown = true;

      // Wait for current jobs to finish
      while (this.processingJobs.size > 0) {
        logger.info(
          `Waiting for ${this.processingJobs.size} jobs to complete...`,
        );
        await this.sleep(1000);
      }

      logger.info("All jobs completed. Shutting down...");
      process.exit(0);
    };

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  }

  private async alive() {
    const aliveInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(aliveInterval);
        return;
      }

      try {
        await coreApi.workersControllerAlive({
          token: Tool.token!,
        });
        if (this.isAliveError) {
          logger.success(
            `RECONNECTED ✅ WorkerId: ${Tool.workerId?.split("-")[0]}`,
          );
          this.isAliveError = false;
        }
      } catch (error: any) {
        if (error?.response?.status === 401) {
          logger.warn("Token unauthorized. Reconnecting...");
          await this.connectToCore();
        } else {
          this.isAliveError = true;
          logger.error("Alive check failed:", error.message);
        }
      }
    }, 5000);
  }

  /**
   * Validates and connects worker via SSE, waits until workerId is set.
   */
  private async connectToCore() {
    let attempt = 0;

    while (true) {
      try {
        const worker: any = await coreApi.workersControllerJoin({
          apiKey: process.env.API_KEY! || process.env.OASM_CLOUD_APIKEY!,
          signature: process.env.WORKER_SIGNATURE || "",
        });
        Tool.workerId = worker.id;
        Tool.token = worker.token;
        logger.success(
          `CONNECTED ✅ WorkerId: ${Tool.workerId?.split("-")[0]}`,
        );

        // Wait until Tool.workerId is set (by SSE handler)
        await this.waitUntil(() => !!Tool.workerId, 1000);
        return; // success, exit the method
      } catch (e: any) {
        // If we get a 401 error, don't retry - just throw an API key invalid error
        if (e?.response?.status === 401) {
          logger.error("API key is invalid. Cannot connect to core.");
        }

        attempt++;
        logger.error(
          `Cannot connect to core ${process.env.API} (attempt ${attempt}):`,
        );
        await this.sleep(1000 * attempt); // exponential backoff delay
      }
    }
  }

  /**
   * Periodically pulls jobs from core if the queue isn't full.
   * Only pulls one job at a time to reduce API load.
   */
  private async pullJobsContinuously() {
    logger.info(`Start pulling jobs with ${this.pullInterval}ms interval...`);
    let lastPullTime = 0;

    while (!this.isShuttingDown) {
      const now = Date.now();

      // Ensure we don't pull more often than pullInterval
      if (now - lastPullTime < this.pullInterval) {
        await this.sleep(100); // Small delay to prevent busy waiting
        continue;
      }

      try {
        // Only pull one job at a time
        if (this.queue.length < this.maxJobsQueue) {
          const job = await this.pullSingleJob();
          if (job) {
            this.queue.push(job);
            if (this.queue.length % 5 === 0) {
              // Log every 5 jobs to reduce noise
              logger.info(
                `Queue size: ${this.queue.length}/${this.maxJobsQueue}`,
              );
            }
          }
        }
        lastPullTime = Date.now();
      } catch (err) {
        logger.error("Cannot get next job:", err);
        await this.reconnectWithBackoff();
      }
    }
  }

  private async pullSingleJob(): Promise<Job | null> {
    try {
      const job = (await coreApi.jobsRegistryControllerGetNextJob(
        Tool.workerId!,
        {
          headers: {
            "worker-token": Tool.token,
          },
        },
      )) as Job;
      return job || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Continuously processes jobs from the queue with concurrency control.
   */
  private async processQueueContinuously() {
    while (!this.isShuttingDown) {
      try {
        // Process jobs concurrently up to the limit
        while (
          this.queue.length > 0 &&
          this.processingJobs.size < this.maxConcurrentJobs &&
          !this.isShuttingDown
        ) {
          const job = this.queue.shift();
          if (job) {
            // Process job without awaiting (fire and forget)
            this.processJobConcurrently(job);
          }
        }
      } catch (error) {
        logger.error("Error in queue processing:", error);
      }

      await this.sleep(100); // Small delay to prevent tight loop
    }
  }

  /**
   * Processes a single job concurrently.
   */
  private async processJobConcurrently(job: Job) {
    this.processingJobs.add(job.id);

    try {
      await this.jobHandler(job);
    } catch (error) {
      logger.error(`Job ${job.id} failed:`, error);
    } finally {
      this.processingJobs.delete(job.id);
    }
  }

  /**
   * Handles a job and reports result to core.
   */
  private async jobHandler(job: Job) {
    const startTime = Date.now();

    try {
      let data: string | null = null;

      if (job.category === ToolCategoryEnum.Screenshot) {
        data = await screenshotHandler(job);
      } else {
        data = await this.commandExecution(job.command);
      }

      await coreApi.jobsRegistryControllerUpdateResult(Tool.workerId!, {
        jobId: job.id,
        data: {
          raw: data,
          error: false,
          payload: {},
        },
      });

      const executionTime = Date.now() - startTime;
      logger
        .color("green")
        .log(
          `[DONE] - JobId: ${job.command} - WorkerId: ${Tool.workerId?.split("-")[0]} - Time: ${executionTime}ms`,
        );
    } catch (e) {
      console.log(e);
      logger.error(`Failed to handle job ${job.id}:`, e);

      // Optionally report failure to core
      try {
        await coreApi.jobsRegistryControllerUpdateResult(
          Tool.workerId!,
          {
            jobId: job.id,
            data: {
              raw: `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
              error: true,
              payload: {},
            },
          },
          {
            headers: {
              "worker-token": Tool.token,
            },
          },
        );
      } catch (reportError) {
        logger.error(
          `Failed to report job failure for ${job.id}:`,
          reportError,
        );
      }
    }
  }

  private async commandExecution(command: string): Promise<string> {
    logger.color("blue").log(`[RUNNING]: ${command}`);

    try {
      return await runCommand(command);
    } catch (error: any) {
      logger.error("Command execution error:", error);
      throw new Error(`Failed to execute command: ${error.message}`);
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  private async reconnectWithBackoff() {
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries && !this.isShuttingDown) {
      try {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        logger.warn(
          `Reconnecting in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`,
        );
        await this.sleep(delay);
        await this.connectToCore();
        return;
      } catch (error) {
        retryCount++;
        logger.error(`Reconnection attempt ${retryCount} failed:`, error);
      }
    }

    throw new Error("Failed to reconnect after maximum retries");
  }

  /**
   * Utility to wait until a condition is met.
   */
  private async waitUntil(
    condition: () => boolean,
    intervalMs: number,
    timeoutMs: number = 30000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (condition()) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error("Timeout waiting for condition"));
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

  /**
   * Get current status for monitoring
   */
  public getStatus() {
    return {
      queueLength: this.queue.length,
      processingJobs: this.processingJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      maxJobsQueue: this.maxJobsQueue,
      workerId: Tool.workerId,
      isShuttingDown: this.isShuttingDown,
    };
  }
}
