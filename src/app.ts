import express from "express";
import type { Application, Request, Response } from "express";
import helmet from "helmet";
import router from "./routes/index.js";
import { apiLimiter } from "./middleware/rateLimiter.js";

const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());

  // Body parser middleware
  app.use(express.json());

  // Root route
  app.get("/", (req: Request, res: Response) => {
    res.send("Scheduler App is running!");
  });

  // Apply rate limiting to API routes
  app.use("/api", apiLimiter);

  // Mount API routes under /api prefix
  app.use("/api", router);

  return app;
};

export default createApp;
