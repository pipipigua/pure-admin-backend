import { createHash } from "crypto";
import { Request, Response } from "express";
import * as fs from "fs";
import * as jwt from "jsonwebtoken";
import * as mysql from "mysql2";
import { OkPacket } from 'mysql2';
import { createMathExpr } from "svg-captcha";
import secret from "../config";
import Logger from "../loaders/logger";
import { Message } from "../utils/enums";
import { connection } from "../utils/mysql";
import { logOperation, ModuleType, OperationType } from "../utils/operationLog";

const utils = require("@pureadmin/utils");

/** 保存验证码 */
let generateVerify: number;

/** 过期时间 单位：毫秒 默认 1分钟过期，方便演示 */
let expiresIn = 60000;

/**
 * @typedef Error
 * @property {string} code.required
 */

/**
 * @typedef Response
 * @property {[integer]} code
 */

// /**
//  * @typedef Login
//  * @property {string} username.required - 用户名 - eg: admin
//  * @property {string} password.required - 密码 - eg: admin123
//  * @property {integer} verify.required - 验证码
//  */

/**
 * @typedef Login
 * @property {string} username.required - 用户名 - eg: admin
 * @property {string} password.required - 密码 - eg: admin123
 */

/**
 * @route POST /login
 * @param {Login.model} point.body.required - the new point
 * @produces application/json application/xml
 * @consumes application/json application/xml
 * @summary 登录
 * @group 用户登录、注册相关
 * @returns {Response.model} 200
 * @returns {Array.<Login>} Login
 * @headers {integer} 200.X-Rate-Limit
 * @headers {string} 200.X-Expires-After
 * @security JWT
 */

const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  
  console.log('Login attempt:', { username, password });

  let sql = `
    SELECT u.*, GROUP_CONCAT(r.code) as roles 
    FROM users u 
    LEFT JOIN user_roles ur ON u.id = ur.user_id 
    LEFT JOIN roles r ON ur.role_id = r.id 
    WHERE u.username = ? AND u.status = 1 
    GROUP BY u.id
  `;
  
  connection.query(sql, [username], async function (err, data: any) {
    // console.log('Query result:', { err, data });

    if (err) {
      // Logger.error(err);
      return res.json({
        success: false,
        data: { message: "数据库查询错误" }
      });
    }

    if (data.length === 0) {
      // 记录登录失败日志
      logOperation({
        userId: 0,
        username: username,
        action: OperationType.LOGIN,
        module: ModuleType.AUTH,
        description: `用户登录失败：用户不存在 (${username})`,
        ip: req.ip || ''
      });

      await res.json({
        success: false,
        data: { message: Message[1] }  // 用户不存在
      });
    } else {
      const user = data[0];
      
      // 验证密码
      const hashedPassword = createHash("md5").update(password).digest("hex");
      if (hashedPassword !== user.password) {
        // 记录登录失败日志
        logOperation({
          userId: 0,
          username: username,
          action: OperationType.LOGIN,
          module: ModuleType.AUTH,
          description: `用户登录失败：密码错误 (${username})`,
          ip: req.ip || ''
        });
        return res.json({
          success: false,
          data: { message: "密码错误" }
        });
      }

      const accessToken = jwt.sign(
        {
          id: user.id,           // 用户ID
          username: user.username,  // 用户名
          name: user.name 
        },
        secret.jwtSecret,
        { expiresIn }
      );
      // 记录登录成功日志
      logOperation({
        userId: user.id,
        username: user.username,
        action: OperationType.LOGIN,
        module: ModuleType.AUTH,
        description: `用户登录成功 (${username})`,
        ip: req.ip || ''
      });
      await res.json({
        success: true,
        data: {
          message: Message[2],
          username: user.name,    // 返回 name 字段作为用户名
          userid: user.userid,    // 返回 userid
          roles: user.roles ? user.roles.split(',') : [],
          accessToken,
          refreshToken: "eyJhbGciOiJIUzUxMiJ9.adminRefresh",
          expires: new Date(new Date()).getTime() + expiresIn,
          department: user.department,
          position: user.position,
          mobile: user.mobile,
          email: user.email,
          avatar: user.avatar
        }
      });
    }
  });
};
// 刷新 token
const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  
  try {
    // 验证 refresh token
    const decoded = jwt.verify(refreshToken, secret.jwtSecret) as any;
    
    // 查询用户是否还有效
    const sql = `SELECT * FROM users WHERE id = ? AND status = 1`;
    
    connection.query(sql, [decoded.id], async function (err, data: any) {
      if (err || data.length === 0) {
        return res.json({
          success: false,
          data: { message: "用户不存在或已禁用" }
        });
      }

      const user = data[0];
      // 生成新的 access token
      const accessToken = jwt.sign(
        {
          id: user.id,
          username: user.username,
          name: user.name
        },
        secret.jwtSecret,
        { expiresIn }
      );

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken: accessToken, // 简单起见，使用相同的 token
          expires: new Date(new Date()).getTime() + expiresIn
        }
      });
    });
  } catch (error) {
    res.json({
      success: false,
      data: {
        message: "refresh token 无效"
      }
    });
  }
};
// /**
//  * @typedef Register
//  * @property {string} username.required - 用户名
//  * @property {string} password.required - 密码
//  * @property {integer} verify.required - 验证码
//  */
/**
 * @typedef Register
 * @property {string} username.required - 用户名
 * @property {string} password.required - 密码
 */

/**
 * @route POST /register
 * @param {Register.model} point.body.required - the new point
 * @produces application/json application/xml
 * @consumes application/json application/xml
 * @summary 注册
 * @group 用户登录、注册相关
 * @returns {Response.model} 200
 * @returns {Array.<Register>} Register
 * @headers {integer} 200.X-Rate-Limit
 * @headers {string} 200.X-Expires-After
 * @security JWT
 */
const register = async (req: Request, res: Response) => {
  const userData = req.body;

  if (userData.password.length < 6)
    return res.json({
      success: false,
      data: { message: Message[4] },
    });

  let sql = "SELECT * FROM users WHERE username = ?";
  
  connection.query(sql, [userData.username], async (err, data: any) => {
    if (err) {
      Logger.error(err);
      return res.json({
        success: false,
        data: { message: "数据库查询错误" }
      });
    }

    if (data.length > 0) {
      await res.json({
        success: false,
        data: { message: Message[5] },
      });
    } else {
      const insertUserSql = `
        INSERT INTO users (
          username,
          userid,
          name,
          password,
          department,
          position,
          mobile,
          gender,
          email,
          avatar,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
      `;

      const values = [
        userData.username,
        userData.userid || null,
        userData.name || userData.username,
        createHash("md5").update(userData.password).digest("hex"),
        userData.department || null,
        userData.position || null,
        userData.mobile || null,
        userData.gender || null,
        userData.email || null,
        userData.avatar || null
      ];

      connection.query(insertUserSql, values, async function (err, result: OkPacket) {  // 指定 result 类型为 OkPacket
        if (err) {
          Logger.error(err);
          return res.json({
            success: false,
            data: { message: "注册失败" }
          });
        }

        // 处理角色关联
        if (userData.roles && userData.roles.length > 0) {
          const userId = result.insertId;  // 现在 TypeScript 知道 result 有 insertId 属性
          const insertRolesSql = `
            INSERT INTO user_roles (user_id, role_id)
            SELECT ?, id FROM roles WHERE code IN (?)
          `;
          
          connection.query(insertRolesSql, [userId, userData.roles], function(err) {
            if (err) {
              Logger.error(err);
              return res.json({
                success: false,
                data: { message: "添加用户角色失败" }
              });
            }
            
            res.json({
              success: true,
              data: { message: Message[6] }
            });
          });
        } else {
          res.json({
            success: true,
            data: { message: Message[6] }
          });
        }
      });
    }
  });
};
// 添加获取用户列表的处理函数
const getUserList = async (req: Request, res: Response) => {
  try {
    const authHeader = req.get("Authorization");
    // console.log('收到的 Authorization header:', authHeader);  // 添加日志看看请求头

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        data: { message: "未登录" }
      });
    }

    // 直接查询用户列表，不做 token 验证
    const sql = `
      SELECT 
        u.*,
        GROUP_CONCAT(r.code) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id
    `;

    connection.query(sql, (err, data: any) => {
      if (err) {
        // Logger.error('查询用户列表错误:', err);
        return res.json({
          success: false,
          data: { message: "获取用户列表失败" }
        });
      }

      // console.log('查询到的用户数据:', data);  // 添加日志看看查询结果

      const users = data.map(user => ({
        ...user,
        roles: user.roles ? user.roles.split(',') : []
      }));

      res.json({
        success: true,
        data: {
          users
        }
      });
    });

  } catch (error) {
    // console.error('获取用户列表错误:', error);
    return res.status(401).json({
      success: false,
      data: { message: "获取用户列表失败" }
    });
  }
};
/**
 * @typedef UpdateList
 * @property {string} username.required - 用户名 - eg: admin
 */

/**
 * @route PUT /updateList/{id}
 * @summary 列表更新
 * @param {UpdateList.model} point.body.required - 用户名
 * @param {UpdateList.model} id.path.required - 用户id
 * @group 用户管理相关
 * @returns {object} 200
 * @returns {Array.<UpdateList>} UpdateList
 * @security JWT
 */

const updateList = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userData = req.body;  // 获取所有更新字段
  
  try {
    // 验证 token
    const authorizationHeader = req.get("Authorization") as string;
    const accessToken = authorizationHeader.substr("Bearer ".length);
    const payload = jwt.verify(accessToken, secret.jwtSecret);

    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    // 检查并添加每个可更新字段
    if (userData.username) {
      updateFields.push("username = ?");
      updateValues.push(userData.username);
    }
    if (userData.name) {
      updateFields.push("name = ?");
      updateValues.push(userData.name);
    }
    if (userData.userid) {
      updateFields.push("userid = ?");
      updateValues.push(userData.userid);
    }
    if (userData.department) {
      updateFields.push("department = ?");
      updateValues.push(userData.department);
    }
    if (userData.position) {
      updateFields.push("position = ?");
      updateValues.push(userData.position);
    }
    if (userData.mobile) {
      updateFields.push("mobile = ?");
      updateValues.push(userData.mobile);
    }
    if (userData.gender) {
      updateFields.push("gender = ?");
      updateValues.push(userData.gender);
    }
    if (userData.email) {
      updateFields.push("email = ?");
      updateValues.push(userData.email);
    }
    if (userData.avatar) {
      updateFields.push("avatar = ?");
      updateValues.push(userData.avatar);
    }
    if (userData.status !== undefined) {
      updateFields.push("status = ?");
      updateValues.push(userData.status);
    }

    // 添加 ID 到 values 数组
    updateValues.push(id);

    const updateSql = `
      UPDATE users 
      SET ${updateFields.join(", ")}
      WHERE id = ?
    `;

    connection.query(updateSql, updateValues, async function(err) {
      if (err) {
        Logger.error(err);
        return res.json({
          success: false,
          data: { message: "更新用户失败" }
        });
      }
      // 直接使用更新的用户信息记录日志
      logOperation({
        userId: Number(id),  // 转换为数字
        username: userData.username || userData.name,  // 使用更新的用户信息
        action: OperationType.UPDATE,
        module: ModuleType.USER,
        description: `更新用户信息:ID=${id}, 字段：${updateFields.join(', ')}`,
        ip: req.ip || ''
      });

      // 如果有角色信息，更新用户角色
      if (userData.roles && userData.roles.length > 0) {
        // 先删除原有角色
        const deleteRolesSql = "DELETE FROM user_roles WHERE user_id = ?";
        connection.query(deleteRolesSql, [id], async function(err) {
          if (err) {
            Logger.error(err);
            return res.json({
              success: false,
              data: { message: "更新用户角色失败" }
            });
          }

          // 插入新角色
          const insertRolesSql = `
            INSERT INTO user_roles (user_id, role_id)
            SELECT ?, id FROM roles WHERE code IN (?)
          `;
          
          connection.query(insertRolesSql, [id, userData.roles], function(err) {
            if (err) {
              Logger.error(err);
              return res.json({
                success: false,
                data: { message: "更新用户角色失败" }
              });
            }
            
            res.json({
              success: true,
              data: { message: Message[7] }
            });
          });
        });
      } else {
        res.json({
          success: true,
          data: { message: Message[7] }
        });
      }
    });
  } catch (error) {
    Logger.error(error);
    return res.status(401).json({
      success: false,
      data: { message: "未授权" }
    });
  }
};

/**
 * @typedef DeleteList
 * @property {integer} id.required - 当前id
 */

/**
 * @route DELETE /deleteList/{id}
 * @summary 列表删除
 * @param {DeleteList.model} id.path.required - 用户id
 * @group 用户管理相关
 * @returns {object} 200
 * @returns {Array.<DeleteList>} DeleteList
 * @security JWT
 */

const deleteList = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    // 验证 token
    const authorizationHeader = req.get("Authorization") as string;
    const accessToken = authorizationHeader.substr("Bearer ".length);
    const payload = jwt.verify(accessToken, secret.jwtSecret);

    // 开始事务
    connection.beginTransaction(function(err) {
      if (err) {
        Logger.error(err);
        return res.json({
          success: false,
          data: { message: "删除失败" }
        });
      }

      // 先删除用户角色关联
      const deleteRolesSql = "DELETE FROM user_roles WHERE user_id = ?";
      connection.query(deleteRolesSql, [id], function(err) {
        if (err) {
          return connection.rollback(function() {
            Logger.error(err);
            res.json({
              success: false,
              data: { message: "删除用户角色失败" }
            });
          });
        }

        // 删除用户
        const deleteUserSql = "DELETE FROM users WHERE id = ?";
        connection.query(deleteUserSql, [id], function(err) {
          if (err) {
            return connection.rollback(function() {
              Logger.error(err);
              res.json({
                success: false,
                data: { message: "删除用户失败" }
              });
            });
          }

          // 提交事务
          connection.commit(function(err) {
            if (err) {
              return connection.rollback(function() {
                Logger.error(err);
                res.json({
                  success: false,
                  data: { message: "删除失败" }
                });
              });
            }
            res.json({
              success: true,
              data: { message: Message[8] }
            });
          });
        });
      });
    });
  } catch (error) {
    Logger.error(error);
    return res.status(401).json({
      success: false,
      data: { message: "未授权" }
    });
  }
};
/**
 * @route GET /api/roles
 * @summary 获取角色列表
 * @group 角色管理
 * @returns {object} 200 - 角色列表
 * @security JWT
 */
const getRoleList = async (req: Request, res: Response) => {
  try {
    const authorizationHeader = req.get("Authorization");
    const accessToken = authorizationHeader.replace("Bearer ", "");
    const decoded = jwt.verify(accessToken, secret.jwtSecret);
    console.log('开始查询角色数据');  // 添加日志

    // 查询所有角色
    const sql = `
      SELECT r.id, r.name, r.code, r.status, r.created_at
      FROM roles r
      WHERE r.status = 1
      ORDER BY r.id ASC
    `;
    
    console.log('执行 SQL:', sql);  // 添加日志
    
    connection.query(sql, function(err, roles) {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.json({
          success: false,
          data: { message: "获取角色列表失败" }
        });
      }

      console.log('查询到的角色:', roles);  // 添加日志
      
      // 立即返回结果
      return res.json({
        success: true,
        data: { roles }
      });
    });

  } catch (error) {
    console.error('获取角色列表错误:', error);
    return res.status(401).json({
      success: false,
      data: { message: "未授权" }
    });
  }
};
/**
 * @typedef SearchPage
 * @property {integer} page.required - 第几页 - eg: 1
 * @property {integer} size.required - 数据量（条）- eg: 5
 */

/**
 * @route POST /searchPage
 * @param {SearchPage.model} point.body.required - the new point
 * @produces application/json application/xml
 * @consumes application/json application/xml
 * @summary 分页查询
 * @group 用户管理相关
 * @returns {Response.model} 200
 * @returns {Array.<SearchPage>} SearchPage
 * @headers {integer} 200.X-Rate-Limit
 * @headers {string} 200.X-Expires-After
 * @security JWT
 */

const searchPage = async (req: Request, res: Response) => {
  const { page, size } = req.body;
  let payload = null;
  try {
    const authorizationHeader = req.get("Authorization") as string;
    const accessToken = authorizationHeader.substr("Bearer ".length);
    payload = jwt.verify(accessToken, secret.jwtSecret);
  } catch (error) {
    return res.status(401).end();
  }
  let sql: string =
    "select * from users limit " + size + " offset " + size * (page - 1);
  connection.query(sql, async function (err, data) {
    if (err) {
      Logger.error(err);
    } else {
      await res.json({
        success: true,
        data,
      });
    }
  });
};

/**
 * @typedef SearchVague
 * @property {string} username.required - 用户名  - eg: admin
 */

/**
 * @route POST /searchVague
 * @param {SearchVague.model} point.body.required - the new point
 * @produces application/json application/xml
 * @consumes application/json application/xml
 * @summary 模糊查询
 * @group 用户管理相关
 * @returns {Response.model} 200
 * @returns {Array.<SearchVague>} SearchVague
 * @headers {integer} 200.X-Rate-Limit
 * @headers {string} 200.X-Expires-After
 * @security JWT
 */

const searchVague = async (req: Request, res: Response) => {
  const { username } = req.body;
  let payload = null;
  try {
    const authorizationHeader = req.get("Authorization") as string;
    const accessToken = authorizationHeader.substr("Bearer ".length);
    payload = jwt.verify(accessToken, secret.jwtSecret);
  } catch (error) {
    return res.status(401).end();
  }
  if (username === "" || username === null)
    return res.json({
      success: false,
      data: { message: Message[9] },
    });
  let sql: string = "select * from users";
  sql += " WHERE username LIKE " + mysql.escape("%" + username + "%");
  connection.query(sql, function (err, data) {
    connection.query(sql, async function (err) {
      if (err) {
        Logger.error(err);
      } else {
        await res.json({
          success: true,
          data,
        });
      }
    });
  });
};

// express-swagger-generator中没有文件上传文档写法，所以请使用postman调试
const upload = async (req: Request, res: Response) => {
  // 文件存放地址
  const des_file: any = (index: number) =>
    "./public/files/" + req.files[index].originalname;
  let filesLength = req.files.length as number;
  let result = [];

  function asyncUpload() {
    return new Promise((resolve, rejects) => {
      (req.files as Array<any>).forEach((ev, index) => {
        fs.readFile(req.files[index].path, function (err, data) {
          fs.writeFile(des_file(index), data, function (err) {
            if (err) {
              rejects(err);
            } else {
              while (filesLength > 0) {
                result.push({
                  filename: req.files[filesLength - 1].originalname,
                  filepath: utils.getAbsolutePath(des_file(filesLength - 1)),
                });
                filesLength--;
              }
              if (filesLength === 0) resolve(result);
            }
          });
        });
      });
    });
  }

  asyncUpload()
    .then((fileList) => {
      res.json({
        success: true,
        data: {
          message: Message[11],
          fileList,
        },
      });
    })
    .catch(() => {
      res.json({
        success: false,
        data: {
          message: Message[10],
          fileList: [],
        },
      });
    });
};

/**
 * @route GET /captcha
 * @summary 图形验证码
 * @group captcha - 图形验证码
 * @returns {object} 200
 */

const captcha = async (req: Request, res: Response) => {
  const create = createMathExpr({
    mathMin: 1,
    mathMax: 4,
    mathOperator: "+",
  });
  generateVerify = Number(create.text);
  res.type("svg"); // 响应的类型
  res.json({ success: true, data: { text: create.text, svg: create.data } });
};
// 添加获取动态路由的处理函数
const getAsyncRoutes = async (req: Request, res: Response) => {
  // 这里返回你的动态路由配置
  res.json({
    success: true,
    data: {
      // 示例路由配置
      routes: [
        {
          path: "/permission",
          meta: {
            title: "权限管理",
            icon: "lollipop"
          },
          children: [
            {
              path: "/permission/page/index",
              name: "PermissionPage",
              meta: {
                title: "页面权限",
                roles: ["admin"]
              }
            }
          ]
        }
        // ... 其他路由配置
      ]
    }
  });
};
export {
  captcha, deleteList, getAsyncRoutes, getRoleList, getUserList, login, refreshToken, register, searchPage,
  searchVague, updateList, upload
};

