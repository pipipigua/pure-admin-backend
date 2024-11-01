import app from "./app";
// import * as open from "open";
import config from "./config";
import * as dayjs from "dayjs";
import * as multer from "multer";
import { user } from "./models/mysql";
import Logger from "./loaders/logger";
import { queryTable, connection } from "./utils/mysql";

// Initialize Swagger documentation
const expressSwagger = require("express-swagger-generator")(app);
expressSwagger(config.options);

// Query the user table
queryTable(user);

// Import route handlers
import {
  login,
  register,
  updateList,
  deleteList,
  searchPage,
  searchVague,
  upload,
  captcha,
} from "./router/http";

// Define routes
app.post("/login", login);
app.post("/register", register);
app.put("/updateList/:id", updateList);
app.delete("/deleteList/:id", deleteList);
app.post("/searchPage", searchPage);
app.post("/searchVague", searchVague);

// Configure file uploads
const upload_tmp = multer({ dest: "upload_tmp/" });
app.post("/upload", upload_tmp.any(), upload);

app.get("/captcha", captcha);

// WebSocket setup
app.ws("/socket", function (ws, req) {
  ws.send(`${dayjs().format("YYYY年MM月DD日HH时mm分ss秒")} 成功连接 socket`);

  // Listen for client closing the socket
  ws.on("close", function (msg) {
    console.log("客户端已关闭 socket", msg);
    ws.close();
  });

  // Listen for messages from the client
  ws.on("message", function (msg) {
    // If client sends 'close', server closes the socket
    if (msg === "close") ws.close();

    ws.send(`${dayjs().format("YYYY年MM月DD日HH时mm分ss秒")} 接收到客户端发送的信息，服务端返回信息：${msg}`);
  });
});

// Endpoint to get distinct years
app.get("/api/years", (req, res) => {
  const query = "SELECT DISTINCT year FROM points";
  connection.query(query, (error, results) => {
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).send("Database query error");
    }
    // Return full results
    res.json(results);
  });
});

// Endpoint to get distinct subjects
app.get("/api/subjects", (req, res) => {
  const query = "SELECT DISTINCT subject FROM points";
  connection.query(query, (error, results) => {
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).send("Database query error");
    }
    // Return full results
    res.json(results);
  });
});

// Endpoint to get distinct grades
app.get("/api/grades", (req, res) => {
  const query = "SELECT DISTINCT sc_lev FROM points";
  connection.query(query, (error, results) => {
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).send("Database query error");
    }
    // Return full results
    res.json(results);
  });
});

// Endpoint to get distinct exam types
app.get("/api/exam-types", (req, res) => {
  const query = "SELECT DISTINCT exam_type FROM points";
  connection.query(query, (error, results) => {
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).send("Database query error");
    }
    // Return full results
    res.json(results);
  });
});

// Modify your existing /query-points endpoint to accept query parameters
app.get("/query-points", (req, res) => {
  const { year, subject, grade, examType } = req.query;

  // Check if all parameters are provided
  if (!year || !subject || !grade || !examType) {
    return res.status(400).send("Missing query parameters");
  }

  // Build the query with the provided parameters
  const query = `
    SELECT * FROM points
    WHERE year = ? AND subject = ? AND sc_lev = ? AND exam_type = ?
  `;

  // Execute the query with parameterized values to prevent SQL injection
  connection.query(query, [year, subject, grade, examType], (error, results) => {
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).send("Database query error");
    }
    res.json(results);
  });
});


// Modify your existing /query-points endpoint to accept query parameters
app.get("/query-points", (req, res) => {
  const { year, subject, grade, examType } = req.query;

  // Check if all parameters are provided
  if (!year || !subject || !grade || !examType) {
    return res.status(400).send("Missing query parameters");
  }

  // Build the query with the provided parameters
  const query = `
    SELECT * FROM points
    WHERE year = ? AND subject = ? AND sc_lev = ? AND exam_type = ?
  `;

  // Execute the query with parameterized values to prevent SQL injection
  connection.query(query, [year, subject, grade, examType], (error, results) => {
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).send("Database query error");
    }
    res.json(results);
  });
});

// index.js (or your server file)
app.post("/update-scores", (req, res) => {
  const students = req.body.data;

  // Validate input data
  if (!students || !Array.isArray(students)) {
    return res.status(400).send("Invalid data format");
  }

  // Construct promises for batch updates
  const queries = students.map(student => {
    const { stnum, point_adj, year, exam_type, subject } = student;

    return new Promise((resolve, reject) => {
      const query = `
        UPDATE points
        SET point_adj = ?
        WHERE stnum = ? AND year = ? AND exam_type = ? AND subject = ?
      `;
      // Use parameterized queries to prevent SQL injection
      connection.query(
        query,
        [point_adj, stnum, year, exam_type, subject],
        (error, results) => {
          if (error) {
            console.error("Database update error:", error);
            reject(error);
          } else {
            resolve(results);
          }
        }
      );
    });
  });

  // Execute all queries
  Promise.all(queries)
    .then(() => {
      res.status(200).send("Scores updated successfully");
    })
    .catch(error => {
      console.error("Error updating scores:", error);
      res.status(500).send("Database update error");
    });
});

// Start the server (only once)
app
  .listen(config.port, () => {
    Logger.info(`
    ################################################
    🛡️  Swagger文档地址: http://localhost:${config.port} 🛡️
    ################################################
  `);
  })
  .on("error", (err) => {
    Logger.error(err);
    process.exit(1);
  });

