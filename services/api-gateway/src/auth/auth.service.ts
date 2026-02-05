import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import * as path from 'path';
import i18n from '../config/i18n';

@Injectable()
export class AuthService {
  private db: Database.Database;

  constructor(private jwtService: JwtService) {
    // Connect to SQLite database
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  async validateUser(email: string, password: string, lang: string = 'en'): Promise<any> {
    const user = this.db
      .prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
      .get(email);

    if (!user) {
      throw new UnauthorizedException(i18n.t('auth:invalidCredentials', { lng: lang }));
    }

    // OAuth users don't have passwords - they should use OAuth flow
    if (!user.password_hash) {
      throw new UnauthorizedException(
        `This account uses ${user.auth_provider} login. Please sign in with ${user.auth_provider}.`
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException(i18n.t('auth:invalidCredentials', { lng: lang }));
    }

    // Update last login
    this.db
      .prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
      .run(user.id);

    const { password_hash, ...result } = user;
    return result;
  }

  async login(email: string, password: string, lang: string = 'en') {
    const user = await this.validateUser(email, password, lang);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan_type,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        plan_type: user.plan_type,
      },
    };
  }

  async register(email: string, password: string) {
    // Check if user already exists
    const existingUser = this.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email);

    if (existingUser) {
      throw new UnauthorizedException('User already exists');
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Generate UUID (simple version for SQLite)
    const id = this.generateId();

    // Insert user with email auth provider
    const insert = this.db.prepare(`
      INSERT INTO users (
        id, email, password_hash, auth_provider, oauth_id,
        role, plan_type, is_active, created_at
      )
      VALUES (?, ?, ?, 'email', NULL, 'user', 'free', 1, datetime('now'))
    `);

    insert.run(id, email, password_hash);

    return {
      id,
      email,
      role: 'user',
      plan_type: 'free',
    };
  }

  async getUserById(id: string) {
    const user = this.db
      .prepare('SELECT id, email, role, plan_type FROM users WHERE id = ? AND is_active = 1')
      .get(id);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
