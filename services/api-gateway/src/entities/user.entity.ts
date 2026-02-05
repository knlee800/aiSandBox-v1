import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { UserRole } from './user-role.enum';
import { Session } from './session.entity';

/**
 * User Entity
 * Represents a user account in the AI Sandbox platform
 */
@Entity('users')
export class User {
  /**
   * Unique identifier (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * User email address (unique, indexed for fast lookups)
   */
  @Index('idx_user_email')
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  /**
   * Hashed password (bcrypt)
   * Never expose this field in responses
   */
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash: string;

  /**
   * User role (admin, user, beta)
   */
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  /**
   * Account active status
   * Inactive accounts cannot log in
   */
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  /**
   * Account creation timestamp
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Last update timestamp
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * User's sessions (one-to-many relationship)
   */
  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];
}
