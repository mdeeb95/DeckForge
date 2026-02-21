FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose port (Railway injects $PORT at runtime)
EXPOSE ${PORT:-8000}

# Run migrations then start uvicorn — shell form so $PORT expands
CMD echo "Running migrations..." && alembic upgrade head && echo "Migrations complete." && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
