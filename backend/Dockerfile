FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose port (Railway injects $PORT at runtime)
EXPOSE ${PORT:-8000}

# Default CMD (overridden by railway.toml startCommand on Railway)
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --log-config log_config.json
