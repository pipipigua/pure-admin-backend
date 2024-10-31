import app from "./app";
// import * as open from "open";
import * as dayjs from "dayjs";
import * as multer from "multer";
import config from "./config";
import Logger from "./loaders/logger";
// import { operationLogs, role, user, userRole } from "./models/mysql";
import { importUsersFromLocalExcel } from "./router/excel";
import { getRoleList, getUserList } from "./router/http";
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
