import "dotenv/config";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import { callGeminiJSON } from "./services/gemini";
import jobsRouter from "./routes/jobs";

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  const geminiKeyPresent = Boolean(process.env.GEMINI_API_KEY?.trim());
  res.status(200).json({ status: "ok", geminiKeyPresent });
});

app.get("/api/test-gemini", async (_req, res) => {
  try {
    const data = await callGeminiJSON(
      'return {"hello": "world"} as JSON',
      [],
      '{ "hello": "string" }'
    );
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.use("/api/jobs", jobsRouter);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`server listening on ${PORT}`));
