CREATE TABLE IF NOT EXISTS accounts (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
 display_name VARCHAR(32) NOT NULL,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('player','admin') NOT NULL DEFAULT 'player',
 verified TINYINT(1) NOT NULL DEFAULT 0,
 state_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at BIGINT UNSIGNED NOT NULL,
 created_at BIGINT UNSIGNED NOT NULL,
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 INDEX account_sessions_expiry(expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS account_records (
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 record_key VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 record_value LONGTEXT NULL,
 PRIMARY KEY(account_id,record_key),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS account_history (
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 match_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 finished_at BIGINT UNSIGNED NOT NULL,
 summary LONGTEXT NOT NULL,
 detail LONGTEXT NOT NULL,
 PRIMARY KEY(account_id,match_id),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 INDEX account_history_order(account_id,finished_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS account_rate_limits (
 bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 attempts INT UNSIGNED NOT NULL,
 window_start BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS account_email_tokens (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 purpose ENUM('verify','reset') NOT NULL,
 expires_at BIGINT UNSIGNED NOT NULL,
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
