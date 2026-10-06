import { api } from "../../../lib/server";
import { exportFeedback } from "../../../lib/feedback-server";
export const GET = (request: Request) => api(() => exportFeedback(request));
