# HireMe Application

## Deployment Instructions

### For Render Deployment

1. Fork this repository to your GitHub account
2. Create a new Web Service on Render
3. Connect your forked repository
4. Configure the following environment variables in Render:
   - `SECRET_KEY` - A random secret key for Flask
   - `DATABASE_URL` - MySQL database connection string (optional, will fallback to SQLite)

### Environment Variables

The application supports the following environment variables:

- `FLASK_ENV` - Set to "production" for production deployments
- `SECRET_KEY` - Secret key for Flask sessions
- `DATABASE_URL` - Database connection string (preferred method)
- `MYSQL_HOST` - MySQL host (fallback method)
- `MYSQL_PORT` - MySQL port (fallback method)
- `MYSQL_USER` - MySQL username (fallback method)
- `MYSQL_PASSWORD` - MySQL password (fallback method)
- `MYSQL_DATABASE` - MySQL database name (fallback method)

### Local Development

To run locally:

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the application:
   ```
   python run.py
   ```

The application will be available at http://localhost:5000

### Health Check

A health check endpoint is available at `/health` which can be used to monitor the application status.

## Troubleshooting

If you encounter database connection issues:

1. Ensure your database environment variables are correctly set
2. Check that your database is accessible from the Render service
3. Use the `/health` endpoint to diagnose connection issues