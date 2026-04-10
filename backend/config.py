from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/staffify_referral"
    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    HUBSTAFF_API_TOKEN: str = ""
    HUBSTAFF_ORG_ID: str = "699143"
    HUBSTAFF_WEBHOOK_SECRET: str = ""
    HUBSTAFF_CLIENT_ID: str = ""
    HUBSTAFF_CLIENT_SECRET: str = ""
    HUBSTAFF_ACCESS_TOKEN: str = ""
    HUBSTAFF_REFRESH_TOKEN: str = ""

    QBO_CLIENT_ID: str = ""
    QBO_CLIENT_SECRET: str = ""
    QBO_REDIRECT_URI: str = ""
    QBO_REALM_ID: str = ""
    QBO_ACCESS_TOKEN: str = ""
    QBO_REFRESH_TOKEN: str = ""
    QBO_ENVIRONMENT: str = "production"  # or "sandbox"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    CRON_SECRET: str = ""  # Shared secret for external cron trigger endpoint

    SLACK_WEBHOOK_URL: str = ""
    GMAIL_USER: str = ""
    GMAIL_APP_PASSWORD: str = ""
    ADMIN_EMAIL: str = ""

    BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


settings = Settings()
