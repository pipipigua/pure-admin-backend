import Logger from "../loaders/logger";
import { connection } from "./mysql";

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
  operatorId: number;      // 操作者ID
  operatorName: string;    // 操作者名称
  targetId?: number;       // 被操作对象ID
  targetType?: string;     // 被操作对象类型
  action: OperationType;   // 操作类型（使用枚举）
  module: ModuleType;      // 模块（使用枚举）
  content: string;         // 操作内容
  ip: string;             // IP地址
}) => {
  const sql = `
    INSERT INTO operation_logs 
    (operator_id, operator_name, target_id, target_type, action, module, content, ip) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    params.operatorId,
    params.operatorName,
    params.targetId || null,
    params.targetType || null,
    params.action,
    params.module,
    params.content,
    params.ip
  ];

  connection.query(sql, values, (err) => {
    if (err) {
      Logger.error('记录操作日志失败:', err);
    }
  });
};