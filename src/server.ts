import app from "./app";
// import * as open from "open";
import * as dayjs from "dayjs";
import * as multer from "multer";
import config from "./config";
import Logger from "./loaders/logger";
// import { operationLogs, role, user, userRole } from "./models/mysql";
import { importUsersFromLocalExcel } from "./router/excel";
import {
  getAsyncRoutes,
  getRoleList,
  getUserList,
  importNormalScores,
  refreshToken,
  updateRolePermissions,
} from "./router/http";
import { connection } from "./utils/mysql";

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

// 添加获取角色列表路由
app.get("/get-async-routes", (req, res) => {
  getAsyncRoutes(req, res);
});
app.get("/roles", (req, res) => {
  // console.log("------------------------");
  // console.log("收到获取角色列表请求");
  // console.log("请求方法:", req.method);
  // console.log("请求路径:", req.path);
  // console.log("请求头:", req.headers);
  // console.log("------------------------");
  getRoleList(req, res);
});
app.post("/refresh-token", refreshToken);

// 添加更新角色权限的路由
app.put("/roles/:roleId/permissions", (req, res) => {
  // console.log("------------------------");
  // console.log("收到更新角色权限请求");
  // console.log("请求 URL:", req.originalUrl);
  // console.log("请求方法:", req.method);
  // console.log("请求路径:", req.path);
  // console.log("请求参数:", req.params);
  // console.log("请求体:", req.body);
  // console.log("请求头:", req.headers);
  // console.log("------------------------");
  updateRolePermissions(req, res);
});

// 新建存放临时文件的文件夹
const upload_tmp = multer({ dest: "upload_tmp/" });
app.post("/upload", upload_tmp.any(), (req, res) => {
  upload(req, res);
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
      // console.error("Database query error:", error);
      return res.status(500).send("Database query error");
    }
    // Return full results
    res.json(results);
  });
});

// 修改获取科目的API - 添加年份筛选
app.get("/api/subjects", (req, res) => {
  const { year } = req.query;

  if (!year) {
    return res.status(400).send("Year parameter is required");
  }

  const query = "SELECT DISTINCT subject FROM points WHERE year = ?";
  connection.query(query, [year], (error, results) => {
    if (error) {
      return res.status(500).send("Database query error");
    }
    res.json(results);
  });
});

// 修改获取年级的API - 添加年份和科目筛选
app.get("/api/grades", (req, res) => {
  const { year, subject } = req.query;

  if (!year || !subject) {
    return res.status(400).send("Year and subject parameters are required");
  }

  const query =
    "SELECT DISTINCT sc_lev FROM points WHERE year = ? AND subject = ?";
  connection.query(query, [year, subject], (error, results) => {
    if (error) {
      return res.status(500).send("Database query error");
    }
    res.json(results);
  });
});

// 修改获取考试类型的API - 添加年份、科目和年级筛选
app.get("/api/exam-types", (req, res) => {
  const { year, subject, grade } = req.query;

  if (!year || !subject || !grade) {
    return res
      .status(400)
      .send("Year, subject and grade parameters are required");
  }

  const query = `
    SELECT DISTINCT exam_type 
    FROM points 
    WHERE year = ? 
    AND subject = ? 
    AND sc_lev = ?
  `;

  connection.query(query, [year, subject, grade], (error, results) => {
    if (error) {
      return res.status(500).send("Database query error");
    }
    res.json(results);
  });
});

import { RowDataPacket } from "mysql2";

interface RatioResult extends RowDataPacket {
  ratio_id: number;
}

app.get("/get-ratios", (req, res) => {
  const { year, subject, grade, examType } = req.query;

  // 修改查询以获取所有相关的ratio_id
  const findRatioIdsQuery = `
    SELECT DISTINCT p.ratio_id 
    FROM points p
    WHERE p.year = ? 
    AND p.subject = ? 
    AND p.sc_lev = ? 
    AND p.exam_type = ? 
    AND p.point_adj IS NOT NULL 
    AND p.ratio_id IS NOT NULL
    GROUP BY p.ratio_id
    HAVING COUNT(*) > 0
  `;

  connection.query<RatioResult[]>(
    findRatioIdsQuery,
    [year, subject, grade, examType],
    (error, ratioResults) => {
      if (error) {
        console.error("Error finding ratio_ids:", error);
        return res.status(500).json({ error: "Database query error" });
      }

      if (!ratioResults || ratioResults.length === 0) {
        return res.json([]);
      }

      // 获取所有ratio_id
      const ratioIds = ratioResults.map((r) => r.ratio_id);

      // 修改查询以获取所有相关的ratio记录
      const getRatiosQuery = `
        SELECT r.* 
        FROM ratio r
        WHERE r.ratio_id IN (?)
        ORDER BY CASE r.sector
          WHEN 'A' THEN 1
          WHEN 'B' THEN 2
          WHEN 'C' THEN 3
          WHEN 'D' THEN 4
          WHEN 'E' THEN 5
        END
      `;

      connection.query(getRatiosQuery, [ratioIds], (error, ratios) => {
        if (error) {
          console.error("Error fetching ratios:", error);
          return res.status(500).json({ error: "Database query error" });
        }
        res.json(ratios);
      });
    }
  );
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
  connection.query(
    query,
    [year, subject, grade, examType],
    (error, results) => {
      if (error) {
        // console.error("Database query error:", error);
        return res.status(500).send("Database query error");
      }
      res.json(results);
    }
  );
});

// index.js (or your server file)
app.post("/update-scores", (req, res) => {
  const students = req.body.data;

  // Validate input data
  if (!students || !Array.isArray(students)) {
    return res.status(400).send("Invalid data format");
  }

  // Construct promises for batch updates
  const queries = students.map((student) => {
    const { point_adj, ratio_id, rank, segment, s_rank, id } = student;

    return new Promise((resolve, reject) => {
      const query = `
        UPDATE points
        SET point_adj = ?, button = 0 ,ratio_id = ?, rank = ?, segment = ?,
            s_rank = ?
        WHERE id = ? 
      `;
      connection.query(
        query,
        [point_adj, ratio_id, rank, segment, s_rank, id],
        (error, results) => {
          if (error) {
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
    .catch((error) => {
      // console.error("Error updating scores:", error);
      res.status(500).send("Database update error");
    });
});
app.post("/add-ratio", (req, res) => {
  const ratioData = req.body.data;

  if (!ratioData || !Array.isArray(ratioData)) {
    return res.status(400).send("Invalid data format");
  }

  const queries = ratioData.map((item) => {
    const { numa, numb, ratio, step, oragina, oranginb, sector } = item;

    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO ratio (numa, numb, ratio, step, oragina, oranginb, sector)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;

      connection.query(
        query,
        [numa, numb, ratio, step, oragina, oranginb, sector],
        (error, results) => {
          if (error) {
            // console.error('Database insert error:', error);
            reject(error);
          } else {
            resolve(results);
            // console.log('Data inserted successfully:', results);
          }
        }
      );
    });
  });

  Promise.all(queries)
    .then((results) => {
      res.status(200).json({ success: true, results });
    })
    .catch((error) => {
      // console.error('Error inserting data:', error);
      res.status(500).json({ success: false, error: "Failed to insert data" });
    });
});

// 添加导入成绩的路由
app.post("/api/import-scores", (req, res) => {
  const scores = req.body;

  if (!Array.isArray(scores) || scores.length === 0) {
    return res.status(400).send("Invalid data format");
  }

  // 过滤掉无效数据
  const validScores = scores.filter((score) => {
    const point = parseFloat(score.point);
    const stnum = parseInt(score.stnum); // B列
    const sc_num = parseInt(score.sc_num); // C列
    return (
      !isNaN(point) &&
      !isNaN(stnum) &&
      !isNaN(sc_num) &&
      score.point !== null &&
      score.point !== ""
    );
  });

  const queries = validScores.map((score) => {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO points 
        (year, exam_type, subject, point, sc_lev, sc_class, sc_num, sc_name, button, stnum)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `;

      const values = [
        parseInt(score.year),
        score.exam_type,
        score.subject,
        parseFloat(score.point),
        score.sc_lev,
        score.sc_class,
        score.sc_num, // C列
        score.sc_name,
        parseInt(score.stnum), // B列作为stnum
      ];

      connection.query(query, values, (error, results) => {
        if (error) {
          console.error("Database error:", error);
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  });

  Promise.all(queries)
    .then(() => {
      res.status(200).json({
        success: true,
        message: `Successfully imported ${validScores.length} scores`,
      });
    })
    .catch((error) => {
      console.error("Import error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    });
});

app.post("/enable-editing", (req, res) => {
  const data = req.body.data;

  const queries = data.map((item) => {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE points
        SET button = ?
        WHERE id = ?
      `;
      connection.query(query, [1, item.id], (error, results) => {
        if (error) {
          // console.error("Database update error:", error);
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  });

  Promise.all(queries)
    .then((results) => {
      res.status(200).json({ success: true, results });
    })
    .catch((error) => {
      console.error("Error updating data:", error);
      res.status(500).json({ success: false, error: "Failed to update data" });
    });
});

// 为总分页面添加新的年级获取API
app.get("/api/total/grades", (req, res) => {
  const { year } = req.query;

  if (!year) {
    return res.status(400).send("Year parameter is required");
  }

  const query = "SELECT DISTINCT sc_lev FROM points WHERE year = ?";
  connection.query(query, [year], (error, results) => {
    if (error) {
      return res.status(500).send("Database query error");
    }
    res.json(results);
  });
});

app.get("/api/total/exam-types", (req, res) => {
  const { year, grade } = req.query;

  if (!year || !grade) {
    return res.status(400).send("Year and grade parameters are required");
  }

  const query = `
    SELECT DISTINCT LEFT(exam_type, 5) as exam_type 
    FROM points 
    WHERE year = ? 
    AND sc_lev = ?
  `;

  connection.query(query, [year, grade], (error, results) => {
    if (error) {
      return res.status(500).send("Database query error");
    }
    res.json(results);
  });
});

app.get("/api/total-scores", (req, res) => {
  const { year, grade, examType } = req.query;
  // console.log("收到总分查询请求:", { year, grade, examType });

  if (!year || !grade || !examType) {
    return res.status(400).json({
      success: false,
      message: "缺少必要的查询参数",
    });
  }

  const query = `
    SELECT
      p.year,
      p.stnum,
      p.sc_name,
      p.sc_lev,
      p.sc_class,
      p.sc_num,
      p.exam_type,
      p.subject,
      p.point_adj,
      p.segment
    FROM points p
    WHERE p.year = ?
    AND p.sc_lev = ?
    AND p.exam_type LIKE CONCAT(?, '%')
  `;

  const searchPattern = `${examType}%`;
  // console.log("执行SQL查询:", query);
  // console.log("查询参数:", [year, grade, searchPattern]);

  connection.query(query, [year, grade, searchPattern], (error, results) => {
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).json({
        success: false,
        message: "数据库查询错误",
      });
    }

    res.json({
      success: true,
      data: results,
    });
  });
});

app.post("/api/import-normal-points", (req, res) => {
  importNormalScores(req, res);
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
