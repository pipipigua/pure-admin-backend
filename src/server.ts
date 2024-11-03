import app from "./app";
// import * as open from "open";
import * as dayjs from "dayjs";
import * as multer from "multer";
import config from "./config";
import Logger from "./loaders/logger";
// import { operationLogs, role, user, userRole } from "./models/mysql";
import { importUsersFromLocalExcel } from "./router/excel";
import { getRoleList, getUserList } from "./router/http";
import { queryTable, connection } from "./utils/mysql";

// import { queryTable } from "./utils/mysql";
const expressSwagger = require("express-swagger-generator")(app);
expressSwagger(config.options);
// 初始化数据库表
// queryTable(user);
// queryTable(role);
// queryTable(userRole);
// queryTable(operationLogs);

import {
  captcha,
  deleteList,
  login,
  register,
  searchPage,
  searchVague,
  updateList,
  upload,
} from "./router/http";

app.post("/login", (req, res) => {
  login(req, res);
});

app.post("/register", (req, res) => {
  register(req, res);
});

app.put("/updateList/:id", (req, res) => {
  updateList(req, res);
});

app.delete("/deleteList/:id", (req, res) => {
  deleteList(req, res);
});

app.post("/searchPage", (req, res) => {
  searchPage(req, res);
});

app.post("/searchVague", (req, res) => {
  searchVague(req, res);
});

// 添加获取用户列表路由
app.get("/user/list", (req, res) => {
  getUserList(req, res);
});
// 新建存放临时文件的文件夹
const upload_tmp = multer({ dest: "upload_tmp/" });
app.post("/upload", upload_tmp.any(), (req, res) => {
  upload(req, res);
});
// 添加获取角色列表路由
app.get("/roles", (req, res) => {  // 注意这里的路径
  console.log("收到获取角色列表请求");  // 添加日志
  getRoleList(req, res);
});


// Excel导入用户路由
app.post("/api/excel/import-local", (req, res) => {
  importUsersFromLocalExcel(req, res);
});


app.get("/captcha", (req, res) => {
  captcha(req, res);
});

app.ws("/socket", function (ws, req) {
  ws.send(
    `${dayjs(new Date()).format("YYYY年MM月DD日HH时mm分ss秒")}成功连接socket`
  );

  // 监听客户端是否关闭socket
  ws.on("close", function (msg) {
    console.log("客户端已关闭socket", msg);
    ws.close();
  });

  // 监听客户端发送的消息
  ws.on("message", function (msg) {
    // 如果客户端发送close，服务端主动关闭该socket
    if (msg === "close") ws.close();

    ws.send(
      `${dayjs(new Date()).format(
        "YYYY年MM月DD日HH时mm分ss秒"
      )}接收到客户端发送的信息，服务端返回信息：${msg}`
    );
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

// open(`http://localhost:${config.port}`); // 自动打开默认浏览器
