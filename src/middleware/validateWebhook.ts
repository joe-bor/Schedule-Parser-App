import type { Request, Response, NextFunction } from "express";

export function validateWebhook(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Basic validation of Telegram update object
  const update = req.body;

  if (!update || typeof update !== "object") {
    return res.status(400).json({ error: "Invalid update format" });
  }

  // Ensure it has expected Telegram update properties
  if (!update.update_id) {
    return res.status(400).json({ error: "Missing update_id" });
  }

  next();
}
