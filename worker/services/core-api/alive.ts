import { createParser, type EventSourceMessage } from "eventsource-parser";
import { Tool } from "../../tool/tool";

const RETRY_DELAY_MS = 3000;

export async function workersControllerAlive(
  workerName: string
): Promise<string> {
  const url = `${process.env.API}/api/workers/${workerName}/alive`;

  return new Promise<string>((resolve, reject) => {
    const connect = async () => {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });

        if (!res.ok || !res.body) {
          throw new Error(
            `[SSE:${workerName}] Failed to connect: ${res.status}`
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");

        const parser = createParser({
          onEvent(event: EventSourceMessage) {
            if (event.event === "message" || !event.event) {
              resolve(event.data); // Success, stop retrying
            } else if (event.event === "error") {
              throw new Error(`Server error: ${event.data}`);
            }
          },
          onError(error) {
            throw error;
          },
        });

        const read = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                console.warn(
                  `[SSE:${workerName}] Stream ended. Retrying in ${RETRY_DELAY_MS / 1000}s...`
                );
                setTimeout(connect, RETRY_DELAY_MS);
                return;
              }

              const chunk = decoder.decode(value, { stream: true });
              try {
                const parsed = JSON.parse(chunk);
                Tool.workerId = parsed.workerId;
                Tool.command = parsed.command;
                console.log(`[SSE:${workerName}] WorkerId: ${Tool.workerId}`);
              } catch (_) {
                // Ignore JSON parse errors for non-JSON data
              }

              parser.feed(chunk);
            }
          } catch (err) {
            console.error(
              `[SSE:${workerName}] Error while reading stream. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
              err
            );
            setTimeout(connect, RETRY_DELAY_MS);
          }
        };

        read();
      } catch (err) {
        console.error(
          `[SSE:${workerName}] Connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
          err
        );
        setTimeout(connect, RETRY_DELAY_MS);
      }
    };

    connect();
  });
}
