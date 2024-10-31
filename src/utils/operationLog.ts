import { connection } from "./mysql";
import Logger from "../loaders/logger";

// 定义操作类型
export enum OperationType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  QUERY = 'QUERY',
  LOGIN = 'LOGIN',
  UPLOAD = 'UPLOAD'
}

// 定义模块类型
export enum ModuleType {
  USER = '用户管理',
  ROLE = '角色管理',
  FILE = '文件管理',
  AUTH = '认证管理'
}

// 记录操作日志
export const logOperation = (params: {
  userId: number;
  username: string;
  action: OperationType;
  module: ModuleType;
  description: string;
  ip: string;
}) => {
  const sql = `
    INSERT INTO operation_logs 
    (user_id, username, action, module, description, ip) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    params.userId,
    params.username,
    params.action,
    params.module,
    params.description,
    params.ip
  ];

  connection.query(sql, values, (err) => {
    if (err) {
      Logger.error('记录操作日志失败:', err);
    }
  });
};