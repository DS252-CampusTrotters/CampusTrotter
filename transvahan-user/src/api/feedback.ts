// transvahan-user/src/api/feedback.ts
import { http } from "./client";

export type FeedbackPayload = {
  vehicle_id: string;   // we send route_id here from the app
  rating: number;       // +1 (thumbs up) / -1 (thumbs down)
  comment?: string;     // optional free-text
};

export async function submitFeedback(payload: FeedbackPayload) {
  const { data } = await http.post("/feedback", payload);
  return data;
}