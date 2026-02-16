#!/usr/bin/env python3
"""Langfuse setup verification script.

Initializes the Langfuse client, verifies the connection,
and prints the dashboard URL.

Usage:
    cd backend
    python -m scripts.setup_langfuse

Requires LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, and LANGFUSE_HOST
to be set in .env or as environment variables.
"""
import os
import sys

# Add backend root to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()


def main():
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")

    print("=" * 60)
    print("DeckForge — Langfuse Setup Verification")
    print("=" * 60)

    if not secret_key or not public_key:
        print("\n[ERROR] Missing Langfuse credentials.")
        print("Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY in backend/.env")
        print("\nExample .env entries:")
        print("  LANGFUSE_SECRET_KEY=sk-lf-...")
        print("  LANGFUSE_PUBLIC_KEY=pk-lf-...")
        print("  LANGFUSE_HOST=https://langfuse.your-app.railway.app")
        sys.exit(1)

    print(f"\n  Host:       {host}")
    print(f"  Public key: {public_key[:12]}...")
    print(f"  Secret key: {secret_key[:12]}...")

    try:
        from langfuse import Langfuse

        client = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
        )

        # Send a test trace to verify the connection
        trace = client.trace(
            name="setup_verification",
            metadata={"source": "setup_langfuse.py"},
        )
        trace.generation(
            name="test_generation",
            model="test",
            input="Setup verification prompt",
            output="Connection verified successfully",
            usage={"input": 10, "output": 5, "total": 15},
        )
        client.flush()

        print("\n  [OK] Langfuse client initialized successfully")
        print(f"  [OK] Test trace sent (trace_id: {trace.id})")

        # Print dashboard URL
        dashboard_url = host.rstrip("/")
        print(f"\n  Dashboard: {dashboard_url}")
        print(f"  Traces:    {dashboard_url}/traces")
        print(f"  Test trace: {dashboard_url}/trace/{trace.id}")

        client.shutdown()
        print("\n  [OK] Setup complete. Langfuse is ready for DeckForge.")

    except Exception as e:
        print(f"\n  [ERROR] Connection failed: {e}")
        print("\n  Check that:")
        print("  1. Your Langfuse instance is running")
        print("  2. The host URL is correct")
        print("  3. The API keys are valid")
        sys.exit(1)

    print("=" * 60)


if __name__ == "__main__":
    main()
