import { createHash } from "crypto";
import { Request, Response } from "express";
import * as path from 'path';
import { promisify } from 'util';
import * as xlsx from 'xlsx';
import { connection } from "../utils/mysql";

const query = promisify(connection.query).bind(connection);
const beginTransaction = promisify(connection.beginTransaction).bind(connection);
const commit = promisify(connection.commit).bind(connection);
const rollback = promisify(connection.rollback).bind(connection);

export async function importUsersFromLocalExcel(req: Request, res: Response) {
  try {
    const filePath = path.join(__dirname, '../../data/teachers.xlsx');
    console.log('Excel文件路径:', filePath);

    const workbook = xlsx.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // 使用之前成功的格式
    const rows = xlsx.utils.sheet_to_json<{
      A: number;     // 序号
      B: string;     // 姓名
      C: string;     // 工号
      D: string;     // 密码
      E: string;     // 角色
      F: string;     // 部门
    }>(worksheet, { 
      range: 1,  // 从第二行开始读取
      header: 'A'  // 使用字母作为键
    });
    
    console.log('读取到的数据行数:', rows.length);
    console.log('第一行数据示例:', rows[0]);

    await beginTransaction();

    try {
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // 获取默认教师角色ID
      const DEFAULT_ROLE_ID = 2;  // 教師角色ID
      const roleMap = new Map<string, number>();

      for (const row of rows) {
        try {
          // 验证必要字段
          if (!row.B || !row.C || !row.D) {
            throw new Error(`数据不完整: 姓名=${row.B}, 工号=${row.C}, 密码=${row.D}`);
          }

          // 获取角色ID
          let roleId = DEFAULT_ROLE_ID;  // 默认使用教师角色
          if (row.E) {
            if (!roleMap.has(row.E)) {
              const existingRoles: any[] = await query(
                "SELECT id FROM roles WHERE name = ?",
                [row.E]
              );
              if (existingRoles.length > 0) {
                roleMap.set(row.E, existingRoles[0].id);
                roleId = existingRoles[0].id;
              } else {
                console.log(`找不到角色 ${row.E}，使用默认教师角色`);
                roleMap.set(row.E, DEFAULT_ROLE_ID);
              }
            } else {
              roleId = roleMap.get(row.E)!;
            }
          }

          const hashedPassword = createHash("md5")
            .update(row.D)
            .digest("hex");

          // 插入用户
          const result: any = await query(
            `INSERT INTO users (
              username, name, password, department, 
              position, status
            ) VALUES (?, ?, ?, ?, ?, 1)`,
            [
              row.C,           // username (工号)
              row.B,           // name (姓名)
              hashedPassword,  // password
              row.F || '',     // department
              row.E || '教師', // position
            ]
          );

          // 插入用户角色关联
          await query(
            "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
            [result.insertId, roleId]
          );

          successCount++;
        } catch (error) {
          console.error('处理用户错误:', error);
          errorCount++;
          errors.push(`行 ${successCount + errorCount}: ${error.message}`);
        }
      }

      await commit();
      console.log('事务提交成功');

      res.json({
        success: true,
        data: {
          message: "导入完成",
          stats: {
            total: rows.length,
            success: successCount,
            error: errorCount
          },
          errors: errors
        }
      });

    } catch (error) {
      console.error('处理数据错误:', error);
      await rollback();
      throw error;
    }
  } catch (error) {
    console.error('导入用户错误:', error);
    res.json({
      success: false,
      data: { 
        message: "导入失败",
        error: error.message
      }
    });
  }
}