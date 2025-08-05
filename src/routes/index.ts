import { Router } from "express";
import healthRoutes from "./health.js";
import telegramRoutes from "./telegram.js";
import calendarRoutes from "./calendar.js";

const router = Router();

// Mount route modules
router.use("/health", healthRoutes);
router.use("/telegram", telegramRoutes);
router.use("/calendar", calendarRoutes);

export default router;
