import os
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
    
    app = Flask(__name__, 
                template_folder='templates',
                static_folder='static')
    
    # Load configuration
    app.config.from_object(config_class)
    
    # Initialize extensions
    db.init_app(app)
    mail.init_app(app)
    socketio.init_app(app, cors_allowed_origins="*")
    migrate.init_app(app, db)
    
    # Register context processor
    @app.context_processor
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
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(job_bp)
    app.register_blueprint(candidate_bp)
    app.register_blueprint(employer_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(interviewer_bp)
    app.register_blueprint(exam_bp)
    app.register_blueprint(notification_bp)
    app.register_blueprint(interview_bp)
    app.register_blueprint(common_bp)
    app.register_blueprint(expert_application_bp)
    
    # Add a simple health check endpoint
    @app.route('/health')
    def health_check():
        try:
            # Test database connection
            db.session.query('1').from_statement(db.text('SELECT 1')).all()
            return {'status': 'healthy', 'database': 'connected'}
        except Exception as e:
            return {'status': 'unhealthy', 'database': str(e)}, 500
    
    # Create database tables
    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            print(f"Warning: Could not create database tables: {e}", file=sys.stderr)
            # Continue anyway as the app might still work for read operations
    
    return app


# For compatibility with platforms that expect an 'app' instance
app = create_app()
