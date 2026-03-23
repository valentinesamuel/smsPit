package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port                string
	UIPort              string
	NodeEnv             string
	DatabaseURL         string
	APIKey              string
	AllowedOrigins      string
	MaxMessages         int
	AutoDeleteAfter     time.Duration
	PurgeInterval       time.Duration
	WebhookURL          string
	WebhookMaxRetries   int
	WebhookRetryBackoff time.Duration
	OTPDetection        bool
	OTPMinLength        int
	OTPMaxLength        int
	OTPExtractMode      string
	AutoTag             bool
}

func Load() *Config {
	return &Config{
		Port:                getEnv("PORT", "4300"),
		UIPort:              getEnv("UI_PORT", "4301"),
		NodeEnv:             getEnv("NODE_ENV", "development"),
		DatabaseURL:         getEnv("DATABASE_URL", "sqlite:./smspit.db"),
		APIKey:              getEnv("API_KEY", ""),
		AllowedOrigins:      getEnv("ALLOWED_ORIGINS", "*"),
		MaxMessages:         getEnvInt("MAX_MESSAGES", 1000),
		AutoDeleteAfter:     getEnvDuration("AUTO_DELETE_AFTER", 24*time.Hour),
		PurgeInterval:       getEnvDuration("PURGE_INTERVAL", time.Hour),
		WebhookURL:          getEnv("WEBHOOK_URL", ""),
		WebhookMaxRetries:   getEnvInt("WEBHOOK_MAX_RETRIES", 3),
		WebhookRetryBackoff: getEnvDuration("WEBHOOK_RETRY_BACKOFF", 5*time.Second),
		OTPDetection:        getEnvBool("OTP_DETECTION", true),
		OTPMinLength:        getEnvInt("OTP_MIN_LENGTH", 4),
		OTPMaxLength:        getEnvInt("OTP_MAX_LENGTH", 8),
		OTPExtractMode:      getEnv("OTP_EXTRACT_MODE", "all"),
		AutoTag:             getEnvBool("AUTO_TAG", true),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getEnvBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return def
}

func getEnvDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}
