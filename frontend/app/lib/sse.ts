import { StreamEvent } from './../types/stream';

/**
 * Reads a Server‑Sent Events stream from a fetch Response and yields parsed events.
 */
async function* readSSEStream(response: Response): AsyncGenerator<StreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by double newlines
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || ''; // keep the last partial message

      for (const msg of messages) {
        const lines = msg.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed: StreamEvent = JSON.parse(data);
              console.log('✅ Parsed event:', parsed); // ADD THIS
              yield parsed;
            } catch (e) {
              console.error('❌ Failed to parse SSE data:', data, e);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Start a new blog generation.
 * Returns a controller that can be used to abort the stream, and the first event
 * will contain the thread_id. The onMessage callback receives all subsequent events.
 */
export async function startGeneration(
  topic: string,
  onMessage: (event: StreamEvent) => void,
  onClose: () => void
): Promise<{ abort: () => void }> {
  const controller = new AbortController();

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    // Process the stream
    (async () => {
      try {
        for await (const event of readSSEStream(response)) {
          onMessage(event);
          if (event.type === 'done') {
            onClose();
            break;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // stream was intentionally aborted – ignore
        } else {
          console.error('Stream error:', err);
          onClose();
        }
      }
    })();

    return { abort: () => controller.abort() };
  } catch (error) {
    console.error('Failed to start generation:', error);
    onClose();
    throw error;
  }
}

/**
 * Send feedback for an existing thread and stream the updated sections.
 */
export async function sendFeedback(
  threadId: string,
  feedback: string,
  onMessage: (event: StreamEvent) => void,
  onClose: () => void
): Promise<{ abort: () => void }> {
  const controller = new AbortController();

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/feedback/${threadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    (async () => {
      try {
        for await (const event of readSSEStream(response)) {
          onMessage(event);
          if (event.type === 'done') {
            onClose();
            break;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // aborted intentionally
        } else {
          console.error('Feedback stream error:', err);
          onClose();
        }
      }
    })();

    return { abort: () => controller.abort() };
  } catch (error) {
    console.error('Failed to send feedback:', error);
    onClose();
    throw error;
  }
}