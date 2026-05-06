import fs from "node:fs";
import path from "node:path";

const required = [
  "package.json",
  "index.html",
  "client/src/App.jsx",
  "client/src/main.jsx",
  "client/src/styles.css",
  "server/src/index.js",
  "prisma/schema.prisma",
  "prisma/seed.js",
  "README.md"
];

const missing = required.filter((file) => !fs.existsSync(path.resolve(file)));
if (missing.length) {
  console.error(`Missing required files: ${missing.join(", ")}`);
  process.exit(1);
}

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
for (const model of ["User", "Profile", "Post", "Comment", "Request", "RequestReply", "Conversation", "Message", "DealRoom", "DealRoomMessage", "DealRoomTask", "DealRoomDocument", "Group", "GroupMember", "GroupPost", "Notification", "SavedPost", "UserConnection"]) {
  if (!schema.includes(`model ${model}`)) {
    console.error(`Missing Prisma model: ${model}`);
    process.exit(1);
  }
}

console.log("Smoke test passed: project files and Prisma models are present.");
