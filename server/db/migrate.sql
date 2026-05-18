-- PostgreSQL schema for TouhouFM Card Battle
-- Compatible with Neon, Supabase, and standard PostgreSQL
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    username VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pending_users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    username VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    verify_code VARCHAR(6) NOT NULL,
    expire_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_code ON pending_users (email, verify_code);
CREATE INDEX IF NOT EXISTS idx_expire ON pending_users (expire_at);