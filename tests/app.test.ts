import request from "supertest";
import createApp from "../src/app.js";

describe("GET /health", () => {
  it("should return 200 and status GOOD", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "GOOD" });
  });
});
