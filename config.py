import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-change-this'
    
    # SQLAlchemy Database configuration - supports Render, Railway, and local MySQL
    # Try to get Render's DATABASE_URL first, then fallback to component variables
    DATABASE_URL = os.environ.get('DATABASE_URL')
    
    if DATABASE_URL:
        # Use Render's provided DATABASE_URL
        SQLALCHEMY_DATABASE_URI = DATABASE_URL
    else:
        # Fallback to component variables
        MYSQL_HOST = os.environ.get('MYSQL_HOST') or os.environ.get('RENDER_DATABASE_HOST') or 'localhost'
        MYSQL_PORT = os.environ.get('MYSQL_PORT', '3306')
        MYSQL_USER = os.environ.get('MYSQL_USER') or os.environ.get('RENDER_DATABASE_USER') or 'root'
        MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD') or os.environ.get('RENDER_DATABASE_PASSWORD') or ''
        MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE') or os.environ.get('RENDER_DATABASE_NAME') or 'hireme'
        
        # Fallback to SQLite if no MySQL credentials are provided
        if not MYSQL_PASSWORD and MYSQL_HOST == 'localhost' and MYSQL_USER == 'root':
            SQLALCHEMY_DATABASE_URI = 'sqlite:///app.db'
        else:
            SQLALCHEMY_DATABASE_URI = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Connection pool settings for production stability
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_recycle': 280,
        'pool_pre_ping': True,
        'pool_size': 10,
        'max_overflow': 20,
    }
    
    # Mail configuration
    MAIL_SERVER = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'True').lower() == 'true'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', 'your-email@gmail.com')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', 'your-app-password')


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    
    # Use SQLite for local development
    SQLALCHEMY_DATABASE_URI = 'sqlite:///app.db'


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    
    # Stricter settings for production
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
