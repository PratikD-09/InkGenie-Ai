export type StreamEvent =
  | { type: "section"; content: string }
  | { type: "thread_id"; thread_id: string }
  | { type: "done" }
  | { type: "error"; message: string };