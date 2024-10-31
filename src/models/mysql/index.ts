/** 创建用户表 */
const user = `
  CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL COMMENT '用户名',
    userid VARCHAR(100) NOT NULL COMMENT '企业微信用户ID',
    name VARCHAR(100) NOT NULL COMMENT '用户名称',
    password VARCHAR(100) NOT NULL COMMENT '密码',
    department VARCHAR(255) COMMENT '部门',
    position VARCHAR(100) COMMENT '职位',
    mobile VARCHAR(20) COMMENT '手机号',
    gender VARCHAR(10) COMMENT '性别',
    email VARCHAR(100) COMMENT '邮箱',
    avatar VARCHAR(255) COMMENT '头像URL',
    status TINYINT DEFAULT 1 COMMENT '状态 1:启用 0:禁用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'
`;

/** 创建角色表 */
const role = `
  CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL COMMENT '角色名称',
    code VARCHAR(50) NOT NULL COMMENT '角色编码',
    status TINYINT DEFAULT 1 COMMENT '状态 1:启用 0:禁用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_code (code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表'
`;

/** 创建用户角色关联表 */
const userRole = `
  CREATE TABLE IF NOT EXISTS user_roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    role_id INT NOT NULL COMMENT '角色ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_user_id (user_id),
    KEY idx_role_id (role_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表'
`;

/** 创建操作日志表 */
const operationLogs = `
CREATE TABLE IF NOT EXISTS operation_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    operator_id INT NOT NULL COMMENT '操作者ID',
    operator_name VARCHAR(100) NOT NULL COMMENT '操作者名称',
    target_id INT COMMENT '被操作对象ID',
    target_type VARCHAR(50) COMMENT '被操作对象类型（如：user, role等）',
    action VARCHAR(50) NOT NULL COMMENT '操作类型：CREATE, UPDATE, DELETE等',
    module VARCHAR(50) NOT NULL COMMENT '操作模块：用户管理、角色管理等',
    content TEXT COMMENT '操作内容（可以存储详细的修改信息）',
    ip VARCHAR(50) COMMENT '操作IP',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (operator_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';
`;

export { operationLogs, role, user, userRole };

