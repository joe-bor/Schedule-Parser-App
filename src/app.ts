import express from "express";
import type { Application, Request, Response } from "express";

const createApp = (): Application => {
  const app = express();

  app.get("/", (req: Request, res: Response) => {
    res.send("Scheduler App is running!");
  });

  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ status: "GOOD" });
  });

  return app;
};

export default createApp;
