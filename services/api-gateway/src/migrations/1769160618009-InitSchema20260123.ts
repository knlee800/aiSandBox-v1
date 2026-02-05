import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema202601231769160618009 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum types
        await queryRunner.query(`CREATE TYPE "user_role" AS ENUM('user', 'admin', 'beta')`);
        await queryRunner.query(`CREATE TYPE "session_status" AS ENUM('pending', 'active', 'stopped', 'expired', 'error')`);
        await queryRunner.query(`CREATE TYPE "chat_message_role" AS ENUM('user', 'assistant', 'system')`);
        await queryRunner.query(`CREATE TYPE "container_status" AS ENUM('creating', 'running', 'stopped', 'error')`);

        // Create users table
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "email" character varying(255) NOT NULL UNIQUE,
                "password_hash" character varying(255) NOT NULL,
                "role" "user_role" NOT NULL DEFAULT 'user',
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_user_email" ON "users" ("email")`);
        await queryRunner.query(`CREATE INDEX "idx_user_role" ON "users" ("role")`);

        // Create sessions table
        await queryRunner.query(`
            CREATE TABLE "sessions" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "status" "session_status" NOT NULL DEFAULT 'pending',
                "container_id" character varying(255),
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "expires_at" TIMESTAMP NOT NULL,
                "last_activity_at" TIMESTAMP NOT NULL,
                "user_id" uuid NOT NULL,
                CONSTRAINT "fk_session_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_session_status" ON "sessions" ("status")`);
        await queryRunner.query(`CREATE INDEX "idx_session_expires_at" ON "sessions" ("expires_at")`);
        await queryRunner.query(`CREATE INDEX "idx_session_user_id" ON "sessions" ("user_id")`);

        // Create conversations table
        await queryRunner.query(`
            CREATE TABLE "conversations" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "session_id" uuid NOT NULL UNIQUE,
                "messages_count" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "fk_conversation_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_conversation_session_id" ON "conversations" ("session_id")`);

        // Create chat_messages table
        await queryRunner.query(`
            CREATE TABLE "chat_messages" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "conversation_id" uuid NOT NULL,
                "role" "chat_message_role" NOT NULL,
                "content" text NOT NULL,
                "tokens_used" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "fk_chat_message_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_chat_message_conversation_id" ON "chat_messages" ("conversation_id")`);
        await queryRunner.query(`CREATE INDEX "idx_chat_message_created_at" ON "chat_messages" ("created_at")`);

        // Create git_checkpoints table
        await queryRunner.query(`
            CREATE TABLE "git_checkpoints" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "session_id" uuid NOT NULL,
                "commit_hash" character varying(40) NOT NULL,
                "message_number" integer,
                "description" character varying(500),
                "files_changed" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "fk_git_checkpoint_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_git_checkpoint_session_id" ON "git_checkpoints" ("session_id")`);
        await queryRunner.query(`CREATE INDEX "idx_git_checkpoint_commit_hash" ON "git_checkpoints" ("commit_hash")`);
        await queryRunner.query(`CREATE INDEX "idx_git_checkpoint_created_at" ON "git_checkpoints" ("created_at")`);

        // Create containers table
        await queryRunner.query(`
            CREATE TABLE "containers" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "session_id" uuid NOT NULL UNIQUE,
                "container_name" character varying(255) NOT NULL UNIQUE,
                "image" character varying(255) NOT NULL,
                "status" "container_status" NOT NULL DEFAULT 'creating',
                "cpu_limit" decimal(4,2),
                "memory_limit_mb" integer,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "started_at" TIMESTAMP,
                "stopped_at" TIMESTAMP,
                CONSTRAINT "fk_container_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_container_session_id" ON "containers" ("session_id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_container_name" ON "containers" ("container_name")`);
        await queryRunner.query(`CREATE INDEX "idx_container_status" ON "containers" ("status")`);

        // Create token_usage table
        await queryRunner.query(`
            CREATE TABLE "token_usage" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "session_id" uuid NOT NULL,
                "conversation_id" uuid,
                "chat_message_id" uuid,
                "model" character varying(100) NOT NULL,
                "input_tokens" integer NOT NULL DEFAULT 0,
                "output_tokens" integer NOT NULL DEFAULT 0,
                "total_tokens" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "fk_token_usage_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_token_usage_session_id" ON "token_usage" ("session_id")`);
        await queryRunner.query(`CREATE INDEX "idx_token_usage_conversation_id" ON "token_usage" ("conversation_id")`);
        await queryRunner.query(`CREATE INDEX "idx_token_usage_chat_message_id" ON "token_usage" ("chat_message_id")`);
        await queryRunner.query(`CREATE INDEX "idx_token_usage_model" ON "token_usage" ("model")`);
        await queryRunner.query(`CREATE INDEX "idx_token_usage_created_at" ON "token_usage" ("created_at")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order (respecting foreign key dependencies)
        await queryRunner.query(`DROP TABLE "token_usage"`);
        await queryRunner.query(`DROP TABLE "containers"`);
        await queryRunner.query(`DROP TABLE "git_checkpoints"`);
        await queryRunner.query(`DROP TABLE "chat_messages"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
        await queryRunner.query(`DROP TABLE "sessions"`);
        await queryRunner.query(`DROP TABLE "users"`);

        // Drop enum types
        await queryRunner.query(`DROP TYPE "container_status"`);
        await queryRunner.query(`DROP TYPE "chat_message_role"`);
        await queryRunner.query(`DROP TYPE "session_status"`);
        await queryRunner.query(`DROP TYPE "user_role"`);
    }

}
