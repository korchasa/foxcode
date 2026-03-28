import * as fs from "fs";

export class UserManager {
  private dbPath = "users.json";

  constructor() {
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, "[]");
    }
  }

  async createUser(name: string, email: string) {
    // Validation
    if (!email.includes("@")) {
      throw new Error("Invalid email");
    }
    if (name.length < 2) {
      throw new Error("Name too short");
    }

    // DB Access
    const users = JSON.parse(fs.readFileSync(this.dbPath, "utf-8"));
    const newUser = { id: Date.now(), name, email };
    users.push(newUser);
    fs.writeFileSync(this.dbPath, JSON.stringify(users));

    // Email Sending
    console.log(`Sending welcome email to ${email}...`);
    // Simulate email delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("Email sent");

    // Logging
    const logEntry = `[${new Date().toISOString()}] User created: ${email}\n`;
    fs.appendFileSync("app.log", logEntry);

    return newUser;
  }

  deleteUser(id: number) {
    // DB Access
    const users = JSON.parse(fs.readFileSync(this.dbPath, "utf-8"));
    const filtered = users.filter((u: { id: number }) => u.id !== id);
    fs.writeFileSync(this.dbPath, JSON.stringify(filtered));

    // Logging
    const logEntry = `[${new Date().toISOString()}] User deleted: ${id}\n`;
    fs.appendFileSync("app.log", logEntry);
  }
}
