import { Router } from "express";

const router = Router();

/** Health check endpoint
 * @route GET /health
 * @returns {object} 200 - Status and health info
 */
router.get("/", (req, res) => {
  res.status(200).json({ status: "GOOD" });
});

export default router;
