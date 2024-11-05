import { Request } from "express";
import * as jwt from "jsonwebtoken";
import secret from "../config";

export interface TokenPayload {
  id: number;
  username: string;
  name: string;
}

// 获取操作者信息
export const getOperator = (req: Request): TokenPayload => {
  const authHeader = req.get("Authorization");
  if (!authHeader) {
    throw new Error("未提供 token");
  }

  const token = authHeader.replace("Bearer ", "");
  const decoded = jwt.verify(token, secret.jwtSecret) as TokenPayload;

  return {
    id: decoded.id,
    username: decoded.username,
    name: decoded.name
  };
};
export const getClientIP = (req: Request): string => {
  // 获取真实 IP 的优先级顺序
  const ip = 
    req.headers['x-real-ip'] ||                 // Nginx 代理的真实 IP
    req.headers['x-forwarded-for'] ||           // 代理服务器链路上的 IP 列表
    req.connection.remoteAddress ||             // TCP 连接的远程 IP
    req.socket.remoteAddress ||                 // Socket 的远程 IP
    '';

  if (!ip) return '未知IP';

  // 处理 x-forwarded-for 的情况（可能包含多个 IP）
  if (typeof ip === 'string' && ip.includes(',')) {
    const ips = ip.split(',');
    // 取第一个非内网 IP
    for (const address of ips) {
      const cleanIP = address.trim();
      if (!isPrivateIP(cleanIP)) {
        return cleanIP;
      }
    }
    // 如果都是内网 IP，返回第一个
    return ips[0].trim();
  }

  // 处理 IPv6 格式的 IPv4 地址
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return String(ip);
};

// 判断是否为内网 IP
function isPrivateIP(ip: string): boolean {
  // 移除 IPv6 前缀
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  // 检查是否为内网 IP 段
  // 10.0.0.0 - 10.255.255.255
  // 172.16.0.0 - 172.31.255.255
  // 192.168.0.0 - 192.168.255.255
  // 127.0.0.1
  const first = parseInt(parts[0]);
  const second = parseInt(parts[1]);
  
  return first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 127 && second === 0);
}