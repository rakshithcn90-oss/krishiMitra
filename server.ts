import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Memory history (simple for demo/hackathon)
  const HISTORY_FILE = path.join(process.cwd(), "history.json");
  
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
  }

  // API Routes
  app.get("/api/weather", async (req, res) => {
    const { city } = req.query;
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      // Fallback/Mock for demo if key is missing
      return res.json({
        temp: 28,
        humidity: 65,
        condition: "Partly Cloudy (Simulated)",
        city: city || "Unknown"
      });
    }

    try {
      const response = await axios.get(
        `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
      );
      res.json({
        temp: response.data.main.temp,
        humidity: response.data.main.humidity,
        condition: response.data.weather[0].description,
        city: response.data.name
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch weather" });
    }
  });

  app.get("/api/history", (req, res) => {
    try {
      const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to read history" });
    }
  });

  app.post("/api/history", (req, res) => {
    try {
      const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
      const newEntry = { ...req.body, id: Date.now(), timestamp: new Date().toISOString() };
      history.push(newEntry);
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
      res.json(newEntry);
    } catch (error) {
      res.status(500).json({ error: "Failed to save history" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
