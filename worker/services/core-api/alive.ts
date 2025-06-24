import { createParser, type EventSourceMessage } from "eventsource-parser";
import { WorkerId } from "./workerId";

export async function workersControllerAlive(
  workerName: string
): Promise<string> {
  const url = `${process.env.CORE_API_URL}/api/workers/${workerName}/alive`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });

  if (!res.ok || !res.body) {
    throw new Error(`[SSE:${workerName}] Failed to connect: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  return new Promise<string>((resolve, reject) => {
    const parser = createParser({
      onEvent(event: EventSourceMessage) {
        if (event.event === "message" || !event.event) {
          resolve(event.data);
        } else if (event.event === "error") {
          reject(new Error(`Server error: ${event.data}`));
        }
      },

      onError(error) {
        reject(error);
      },
    });

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            reject(
              new Error(
                `[SSE:${workerName}] Stream ended without receiving any messages`
              )
            );
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const workerId = JSON.parse(chunk).workerId;
          WorkerId.setWorkerId(workerId);
          parser.feed(chunk);
        }
      } catch (err) {
        reject(err);
      }
    };

    read();
  });
}
