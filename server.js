import "dotenv/config";
import express from "express";
import mysql from "mysql2/promise";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const distPath = path.join(__dirname, "dist");
const camUsername = process.env.CAM_USERNAME;
const camPassword = process.env.CAM_PASSWORD;

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

const hasDatabaseConfig = Boolean(
  dbConfig.host && dbConfig.database && dbConfig.user && dbConfig.password,
);

const memoryChecks = new Map();
let pool;
let tableReady = false;

if (hasDatabaseConfig) {
  pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 5,
    namedPlaceholders: true,
  });
} else {
  console.warn("MySQL env vars are missing. API will use in-memory storage for this process.");
}

app.use(express.json());

function requireCamAuth(req, res, next) {
  if (!camUsername || !camPassword) {
    res.status(503).send("Camera access is not configured.");
    return;
  }

  const authHeader = req.get("authorization") || "";
  const [scheme, encodedCredentials] = authHeader.split(" ");

  if (scheme !== "Basic" || !encodedCredentials) {
    res.set("WWW-Authenticate", 'Basic realm="Crono camera"');
    res.status(401).send("Authentication required.");
    return;
  }

  const credentials = Buffer.from(encodedCredentials, "base64").toString("utf8");
  const separatorIndex = credentials.indexOf(":");
  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);

  if (username !== camUsername || password !== camPassword) {
    res.set("WWW-Authenticate", 'Basic realm="Crono camera"');
    res.status(401).send("Authentication required.");
    return;
  }

  next();
}

function createChecklistKey(date, taskId, assignedTo, itemIndex) {
  return `${date}:${taskId}:${assignedTo}:${itemIndex}`;
}

async function ensureTable() {
  if (!pool || tableReady) {
    return;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS task_checks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_date DATE NOT NULL,
      task_id VARCHAR(80) NOT NULL,
      assigned_to VARCHAR(20) NOT NULL,
      item_index INT NOT NULL,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_check (task_date, task_id, assigned_to, item_index)
    )
  `);

  tableReady = true;
}

async function cleanupPastDates() {
  if (pool) {
    await ensureTable();
    await pool.execute("DELETE FROM task_checks WHERE task_date < CURDATE()");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const key of memoryChecks.keys()) {
    if (key.slice(0, 10) < today) {
      memoryChecks.delete(key);
    }
  }
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }

  return value;
}

function requireInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be boolean`);
  }

  return value;
}

function sendApiError(res, error) {
  console.error(error);
  res.status(400).json({ error: error.message || "Request failed" });
}

app.get("/api/health", async (_req, res) => {
  try {
    if (pool) {
      await ensureTable();
      await pool.query("SELECT 1");
    }

    res.json({
      ok: true,
      storage: pool ? "mysql" : "memory",
      mysqlConfigured: hasDatabaseConfig,
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get("/api/checks", async (req, res) => {
  try {
    const from = String(req.query.from || new Date().toISOString().slice(0, 10));
    await cleanupPastDates();

    if (pool) {
      await ensureTable();
      const [rows] = await pool.execute(
        `
          SELECT
            DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
            task_id AS taskId,
            assigned_to AS assignedTo,
            item_index AS itemIndex,
            completed
          FROM task_checks
          WHERE task_date >= :from
        `,
        { from },
      );
      const checks = {};

      for (const row of rows) {
        checks[createChecklistKey(row.taskDate, row.taskId, row.assignedTo, row.itemIndex)] =
          row.completed === 1;
      }

      res.json({ checks });
      return;
    }

    const checks = {};
    for (const [key, value] of memoryChecks.entries()) {
      if (key.slice(0, 10) >= from) {
        checks[key] = value;
      }
    }
    res.json({ checks });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/checks/item", async (req, res) => {
  try {
    const date = requireString(req.body.date, "date");
    const taskId = requireString(req.body.taskId, "taskId");
    const assignedTo = requireString(req.body.assignedTo, "assignedTo");
    const itemIndex = requireInteger(req.body.itemIndex, "itemIndex");
    const completed = requireBoolean(req.body.completed, "completed");

    if (pool) {
      await ensureTable();
      await pool.execute(
        `
          INSERT INTO task_checks (task_date, task_id, assigned_to, item_index, completed)
          VALUES (:date, :taskId, :assignedTo, :itemIndex, :completed)
          ON DUPLICATE KEY UPDATE completed = VALUES(completed)
        `,
        { date, taskId, assignedTo, itemIndex, completed },
      );
    } else {
      memoryChecks.set(createChecklistKey(date, taskId, assignedTo, itemIndex), completed);
    }

    res.json({ ok: true });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/checks/task", async (req, res) => {
  try {
    const date = requireString(req.body.date, "date");
    const taskId = requireString(req.body.taskId, "taskId");
    const assignedTo = requireString(req.body.assignedTo, "assignedTo");
    const itemCount = requireInteger(req.body.itemCount, "itemCount");
    const completed = requireBoolean(req.body.completed, "completed");

    if (pool) {
      await ensureTable();
      const values = Array.from({ length: itemCount }, (_, itemIndex) => [
        date,
        taskId,
        assignedTo,
        itemIndex,
        completed,
      ]);

      if (values.length > 0) {
        await pool.query(
          `
            INSERT INTO task_checks (task_date, task_id, assigned_to, item_index, completed)
            VALUES ?
            ON DUPLICATE KEY UPDATE completed = VALUES(completed)
          `,
          [values],
        );
      }
    } else {
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        memoryChecks.set(createChecklistKey(date, taskId, assignedTo, itemIndex), completed);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/checks/reset-day", async (req, res) => {
  try {
    const date = requireString(req.body.date, "date");

    if (pool) {
      await ensureTable();
      await pool.execute("DELETE FROM task_checks WHERE task_date = :date", { date });
    } else {
      for (const key of memoryChecks.keys()) {
        if (key.startsWith(`${date}:`)) {
          memoryChecks.delete(key);
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.use("/cam", requireCamAuth);

app.use(express.static(distPath));

app.use((_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Cronograma app running on port ${port}`);
});
