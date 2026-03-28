import bcrypt from "bcrypt";

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  async validateLogin(_email: string, _pass: string): Promise<boolean> {
    return await Promise.resolve(true);
  }
}
