import sys
import os

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_migrate import Migrate
from config import DevelopmentConfig, ProductionConfig
from extensions import db, mail, socketio
from models import *
import realtime  # Import to register Socket.IO event handlers

migrate = Migrate()

def create_app(config_class=None):
    """Application factory function"""
    # Auto-select config based on environment
    if config_class is None:
        if os.environ.get('FLASK_ENV') == 'production':
            config_class = ProductionConfig
        else:
            config_class = DevelopmentConfig
    
    application = Flask(__name__, 
                template_folder='templates',
                static_folder='static')
    
    # Load configuration
    application.config.from_object(config_class)
    
    # Initialize extensions
    db.init_app(application)
    mail.init_app(application)
    socketio.init_app(application, cors_allowed_origins="*")
    migrate.init_app(application, db)
    
    # Register context processor
    @application.context_processor
    def inject_datetime():
        from datetime import datetime, timedelta
        from flask import session
        from models import Notification
        
        unread_count = 0
        if 'user_id' in session:
            unread_count = Notification.query.filter_by(
                user_id=session['user_id'],
                is_read=False
            ).count()
        
        return {
            'datetime': datetime,
            'timedelta': timedelta,
            'now': datetime.now(),
            'unread_notification_count': unread_count
        }
    
    # Register blueprints
    from routes.main import main_bp
    from routes.auth import auth_bp
    from routes.job import job_bp
    from routes.candidate import candidate_bp
    from routes.employer import bp as employer_bp
    from routes.admin import bp as admin_bp
    from routes.interviewer import bp as interviewer_bp
    from routes.exam import bp as exam_bp
    from routes.notification import bp as notification_bp
    from routes.interview import bp as interview_bp
    from routes.common import bp as common_bp
    from routes.expert_application import bp as expert_application_bp
    
    application.register_blueprint(main_bp)
    application.register_blueprint(auth_bp)
    application.register_blueprint(job_bp)
    application.register_blueprint(candidate_bp)
    application.register_blueprint(employer_bp)
    application.register_blueprint(admin_bp)
    application.register_blueprint(interviewer_bp)
    application.register_blueprint(exam_bp)
    application.register_blueprint(notification_bp)
    application.register_blueprint(interview_bp)
    application.register_blueprint(common_bp)
    application.register_blueprint(expert_application_bp)
    
    # Create database tables
    with application.app_context():
        db.create_all()
    
    return application

# Create the app instance for gunicorn
app = create_app()

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
