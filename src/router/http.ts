import { createHash } from "crypto";
import { Request, Response } from "express";
import * as fs from "fs";
import * as jwt from "jsonwebtoken";
import * as mysql from "mysql2";
import { RowDataPacket } from 'mysql2';
import { createMathExpr } from "svg-captcha";
import secret from "../config";
import Logger from "../loaders/logger";
import { getClientIP, getOperator } from "../utils/auth";
import { Message } from "../utils/enums";
import { connection } from "../utils/mysql";
import { logOperation, ModuleType, OperationType } from "../utils/operationLog";
const utils = require("@pureadmin/utils");

/** 保存验证码 */
let generateVerify: number;

/** 过期时间 单位：毫秒 默认 1分钟过期，方便演示 */
let expiresIn = 2 * 60 * 60 * 1000; 
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
  
  console.log('Login attempt:', { username }); // 不要打印密码

  // 先查询用户是否存在
  const sql = `
    SELECT u.*, GROUP_CONCAT(DISTINCT r.code) as roles, 
           GROUP_CONCAT(DISTINCT p.code) as permissions
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    LEFT JOIN permissions p ON rp.permission_id = p.id
    WHERE u.username = ?
    GROUP BY u.id
  `;
  
  connection.query(sql, [username], async function (err, data: any) {
    if (err) {
      Logger.error(err);
      return res.json({
        success: false,
        data: { message: "系统错误" }
      });
    }

    // 用户不存在
    if (data.length === 0) {
      logOperation({
        operatorId: 0,
        operatorName: username,
        action: OperationType.LOGIN,
        module: ModuleType.AUTH,
        content: `用户登录失败：用户不存在`,
        ip: getClientIP(req)
      });

      return res.json({
        success: false,
        data: { message: Message[1] }  // 用户不存在
      });
    }

    const user = data[0];
    
    // 验证密码
    const hashedPassword = createHash("md5").update(password).digest("hex");
    if (hashedPassword !== user.password) {
      logOperation({
        operatorId: 0,
        operatorName: username,
        action: OperationType.LOGIN,
        module: ModuleType.AUTH,
        content: `用户登录失败：密码错误`,
        ip: getClientIP(req)
      });
      
      return res.json({
        success: false,
        data: { message: "密码错误" }
      });
    }

    // 验证用户状态
    if (user.status !== 1) {
      logOperation({
        operatorId: 0,
        operatorName: username,
        action: OperationType.LOGIN,
        module: ModuleType.AUTH,
        content: `用户登录失败：账号已禁用`,
        ip: getClientIP(req)
      });
      
      return res.json({
        success: false,
        data: { message: "账号已禁用" }
      });
    }

    // 登录成功，生成 token
    const accessToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        name: user.name 
      },
      secret.jwtSecret,
      { expiresIn }
    );

    // 记录登录成功日志
    logOperation({
      operatorId: user.id,
      operatorName: user.username,
      action: OperationType.LOGIN,
      module: ModuleType.AUTH,
      content: `用户登录成功`,
      ip: getClientIP(req)
    });
    // 在返回响应之前添加日志
    console.log('User data:', user);
    console.log('Roles:', user.roles);
    console.log('Split roles:', user.roles ? user.roles.split(',') : []);
    return res.json({
      success: true,
      data: {
        message: Message[2],
        username: user.name,
        userid: user.userid,
        roles: user.roles ? user.roles.split(',') : [],
        accessToken,
        refreshToken: "eyJhbGciOiJIUzUxMiJ9.adminRefresh",
        expires: new Date(new Date()).getTime() + expiresIn,
        department: user.department,
        position: user.position,
        mobile: user.mobile,
        email: user.email,
        avatar: user.avatar,
        permissions: user.permissions ? user.permissions.split(',') : [], // 添加这行
      }
    });
  });
};
// 刷新 token
const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  
  try {
    // 验证 refresh token
    const decoded = jwt.verify(refreshToken, secret.jwtSecret) as any;
    
    // 查询用户是否还有效
    const sql = `
      SELECT u.*, GROUP_CONCAT(DISTINCT r.code) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ? AND u.status = 1
      GROUP BY u.id
    `;
    
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
        { expiresIn: '2h' }  // token 有效期2小时
      );

      return res.json({
        success: true,
        data: {
          accessToken,
          refreshToken: accessToken, // 为简单起见，使用相同的 token
          expires: new Date().getTime() + (2 * 60 * 60 * 1000) // 2小时后过期
        }
      });
    });
  } catch (error) {
    Logger.error('刷新token错误:', error);
    return res.json({
      success: false,
      data: { message: "refresh token 无效" }
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
  const { username, password, name } = req.body;
  const DEFAULT_ROLE_ID = 2;  // 设置默认角色 ID 为 2

  try {
    // 检查用户名是否已存在
    const checkSql = "SELECT id FROM users WHERE username = ?";
    connection.query(checkSql, [username], async function(err, result: any) {
      if (err) {
        Logger.error(err);
        return res.json({
          success: false,
          data: { message: "系统错误" }
        });
      }

      if (result.length > 0) {
        return res.json({
          success: false,
          data: { message: Message[5] }  // 用户名已存在
        });
      }

      // 开始事务
      connection.beginTransaction(async function(err) {
        if (err) {
          Logger.error(err);
          return res.json({
            success: false,
            data: { message: "注册失败" }
          });
        }

        const hashedPassword = createHash("md5").update(password).digest("hex");
        
        // 插入用户基本信息
        const insertSql = `
          INSERT INTO users (
            username, password, name, status,
            userid, department, position,
            created_at, updated_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?, NOW(), NOW())
        `;

        connection.query(insertSql, [username, hashedPassword, name], function(err, result: any) {
          if (err) {
            return connection.rollback(function() {
              Logger.error(err);
              res.json({
                success: false,
                data: { message: "注册失败" }
              });
            });
          }

          const userId = result.insertId;

          // 为新用户分配默认角色
          const insertRoleSql = "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)";
          connection.query(insertRoleSql, [userId, DEFAULT_ROLE_ID], function(err) {
            if (err) {
              return connection.rollback(function() {
                Logger.error(err);
                res.json({
                  success: false,
                  data: { message: "分配角色失败" }
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
                    data: { message: "注册失败" }
                  });
                });
              }

              // 记录注册操作日志
              logOperation({
                operatorId: userId,
                operatorName: username,
                action: OperationType.CREATE,
                module: ModuleType.AUTH,
                content: `新用户注册：${username}`,
                ip: getClientIP(req)
              });

              res.json({
                success: true,
                data: { message: Message[6] }  // 注册成功
              });
            });
          });
        });
      });
    });
  } catch (error) {
    Logger.error(error);
    return res.json({
      success: false,
      data: { message: "注册失败" }
    });
  }
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
        GROUP_CONCAT(r.code) as roles,
        MIN(r.id) as primary_role_id  
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id 
      ORDER BY primary_role_id ASC, u.id ASC  
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
      const operator = getOperator(req);
      // 记录操作日志
      logOperation({
        operatorId: operator.id,          // 使用 decoded 而不是 operator
        operatorName: operator.name,      // 使用 decoded 而不是 operator
        targetId: Number(id),            // 被更新用户的ID
        targetType: 'user',              // 被操作对象类型
        action: OperationType.UPDATE,    // 操作类型
        module: ModuleType.USER,         // 模块
        content: `更新用户信息：${JSON.stringify(userData)}`,  // 操作内容
        ip: getClientIP(req)
      });
      // 如果有角色信息，更新用户角色和权限
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

          // 插入新角色并获取相应的权限
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
          // 记录删除操作日志

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
            const operator = getOperator(req);
            logOperation({
              operatorId: operator.id,
              operatorName: operator.name,
              targetId: Number(id),
              targetType: 'user',
              action: OperationType.DELETE,
              module: ModuleType.USER,
              content: `删除用户：${id}`,
              ip: getClientIP(req)
            });
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
interface RoleRow extends RowDataPacket {
  id: number;
  name: string;
  code: string;
  description: string;
  status: number;
  created_at: Date;
  updated_at: Date;
}

interface PermissionRow extends RowDataPacket {
  code: string;
}

interface RoleWithPermissions {
  id: number;
  name: string;
  code: string;
  description: string;
  status: number;
  created_at: Date;
  updated_at: Date;
  permissions: string[];
}

interface PermissionTree extends RowDataPacket {
  id: number;
  name: string;
  code: string;
  type: string;
  description: string;
  parent_id: number | null;
  level: number;
  path: string;
  children?: PermissionTree[];
}

const getRoleList = async (req: Request, res: Response) => {
  try {
    const authorizationHeader = req.get("Authorization");
    const accessToken = authorizationHeader.replace("Bearer ", "");
    const decoded = jwt.verify(accessToken, secret.jwtSecret);
    // 1. 获取所有角色
    const rolesSql = `
      SELECT id, name, code, description, status, created_at
      FROM roles 
      WHERE status = 1
      ORDER BY id ASC
    `;

    connection.query<RoleRow[]>(rolesSql, async function(err, roles) {
      if (err) {
        console.error('获取角色列表失败:', err);
        return res.json({
          success: false,
          data: { message: "获取角色列表失败" }
        });
      }

      // 2. 获取所有权限
      const permissionsSql = `
        SELECT id, name, code, type, description, parent_id
        FROM permissions
        WHERE status = 1
        ORDER BY id ASC
      `;
      connection.query<PermissionTree[]>(permissionsSql, async (err, permissions) => {
        if (err) {
          console.error('获取权限列表失败:', err);
          return res.json({
            success: false,
            data: { message: "获取权限列表失败" }
          });
        }
        try {
          // 3. 获取每个角色的权限
          const rolesWithPermissions = await Promise.all(roles.map(async (role) => {
              const rolePremsSql = `
                SELECT p.code
                FROM permissions p
                INNER JOIN role_permissions rp ON p.id = rp.permission_id
                WHERE rp.role_id = ? AND p.status = 1
              `;
            return new Promise<RoleWithPermissions>((resolve, reject) => {
              connection.query<PermissionRow[]>(
                rolePremsSql,
                [role.id],
                (err, perms) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  resolve({
                    ...role,
                    permissions: perms.map(p => p.code)
                  });
                }
              );
            });
          }));
          // 4. 构建权限树
          const buildTree = (items: PermissionTree[], parentId: number | null = null): PermissionTree[] => {
            return items
              .filter(item => item.parent_id === parentId)
              .map(item => ({
                ...item,
                children: buildTree(items, item.id)
              }));
          };
          // 5. 返回结果
          return res.json({
            success: true,
            data: {
              roles: rolesWithPermissions,
              permissions: buildTree(permissions)
            }
          });
        } catch (error) {
          console.error('处理角色权限数据失败:', error);
          return res.json({
            success: false,
            data: { message: "处理角色权限数据失败" }
          });
        }
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

interface PermissionRow {
  code: string;
}

const getUserPermissions = async (req: Request, res: Response) => {
  try {
    const authorizationHeader = req.get("Authorization");
    const accessToken = authorizationHeader?.replace("Bearer ", "");
    const decoded = jwt.verify(accessToken, secret.jwtSecret) as { username: string };
    
    const sql = `
      SELECT DISTINCT p.code
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      JOIN users u ON ur.user_id = u.id
      WHERE u.username = ? AND p.status = 1
    `;
    
    connection.query<PermissionRow[]>(sql, [decoded.username], (err, results) => {
      if (err) {
        Logger.error('获取用户权限失败:', err);
        return res.json({
          success: false,
          message: "获取权限失败"
        });
      }

      const permissions = results.map(row => row.code);
      res.json({
        success: true,
        data: {
          permissions
        }
      });
    });
  } catch (error) {
    console.error('获取用户权限失败:', error);
    res.status(401).json({
      success: false,
      message: "未授权"
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



const updateRolePermissions = async (req: Request, res: Response) => {
  try {
    const authorizationHeader = req.get("Authorization");
    const accessToken = authorizationHeader.replace("Bearer ", "");
    const decoded = jwt.verify(accessToken, secret.jwtSecret);
    const operator = getOperator(req);
    
    const roleId = req.params.roleId;
    const permissions = req.body.permissions;

    // 1. 先获取角色信息
    const getRoleSql = "SELECT name FROM roles WHERE id = ?";
    connection.query(getRoleSql, [roleId], (err, roleResults) => {
      if (err) {
        Logger.error('获取角色信息失败:', err);
        return res.json({
          success: false,
          message: "更新权限失败"
        });
      }

      const roleName = roleResults[0]?.name;

      // 2. 删除该角色的所有权限
      const deleteSql = `DELETE FROM role_permissions WHERE role_id = ?`;
      connection.query(deleteSql, [roleId], (err) => {
        if (err) {
          Logger.error('删除角色权限失败:', err);
          return res.json({
            success: false,
            message: "更新权限失败"
          });
        }

        // 3. 如果有新的权限，则插入
        if (permissions && permissions.length > 0) {
          const insertSql = `
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT ?, id FROM permissions WHERE code IN (?)
          `;
          connection.query(insertSql, [roleId, permissions], (err) => {
            if (err) {
              Logger.error('插入角色权限失败:', err);
              return res.json({
                success: false,
                message: "更新权限失败"
              });
            }

            // 4. 记录操作日志
            logOperation({
              operatorId: operator.id,
              operatorName: operator.name,
              targetId: Number(roleId),
              targetType: 'role',
              action: OperationType.UPDATE,
              module: ModuleType.ROLE,
              content: `更新角色[${roleName}]的权限：${JSON.stringify(permissions)}`,
              ip: getClientIP(req)
            });

            res.json({
              success: true,
              message: "更新权限成功"
            });
          });
        } else {
          // 如果没有新权限，也记录日志
          logOperation({
            operatorId: operator.id,
            operatorName: operator.name,
            targetId: Number(roleId),
            targetType: 'role',
            action: OperationType.UPDATE,
            module: ModuleType.ROLE,
            content: `清空角色[${roleName}]的所有权限`,
            ip: getClientIP(req)
          });

          res.json({
            success: true,
            message: "更新权限成功"
          });
        }
      });
    });
  } catch (error) {
    Logger.error('更新角色权限错误:', error);
    return res.status(500).json({
      success: false,
      message: "服务器错误"
    });
  }
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
// pure-admin-backend/src/router/routes.ts
const getAsyncRoutes = async (req: Request, res: Response) => {
  try {
    const authorizationHeader = req.get("Authorization");
    const accessToken = authorizationHeader.replace("Bearer ", "");
    const decoded = jwt.verify(accessToken, secret.jwtSecret);
    
    // 根据用户角色返回对应的路由
    const routes = [
      {
        path: "/permission",
        name: "Permission",
        meta: {
          title: "权限管理",
          icon: "lollipop",
          rank: 10
        },
        children: [
          {
            path: "/permission/role/index",
            name: "PermissionRole",
            meta: {
              title: "角色权限",
              roles: ["admin"]
            }
          }
        ]
      }
    ];

    res.json({
      success: true,
      data: routes
    });
  } catch (error) {
    console.error('获取动态路由失败:', error);
    res.status(401).json({
      success: false,
      message: "未授权"
    });
  }
};
export {
  captcha, deleteList, getAsyncRoutes, getRoleList, getUserList, getUserPermissions, login, refreshToken, register, searchPage,
  searchVague, updateList, updateRolePermissions, upload
};

