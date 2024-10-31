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