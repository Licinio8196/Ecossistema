import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const prismaCli = path.resolve("node_modules", "prisma", "build", "index.js");

const sql = execFileSync(
  process.execPath,
  [prismaCli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
  { encoding: "utf8" }
);

const statements = sql
  .split(";")
  .map((statement) =>
    statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter(Boolean);

for (const statement of statements) {
  try {
    await prisma.$executeRawUnsafe(statement);
  } catch (error) {
    if (!String(error.message).includes("already exists")) throw error;
  }
}

console.log(`Schema aplicado com ${statements.length} comandos SQL.`);
await prisma.$disconnect();
