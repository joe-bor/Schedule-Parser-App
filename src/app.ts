import express from "express";
import type { Application, Request, Response } from "express";
import router from "./routes/index.js";

const createApp = (): Application => {
  const app = express();

  // Body parser middleware
  app.use(express.json());

  // Root route
  app.get("/", (req: Request, res: Response) => {
    res.send("Scheduler App is running!");
  });

  // Mount API routes under /api prefix
  app.use("/api", router);

  return app;
};

export default createApp;
