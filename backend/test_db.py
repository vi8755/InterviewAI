
from sqlalchemy import create_engine, text

from app.core.config import settings


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)

try:
    with engine.connect() as connection:
        result = connection.execute(
            text(
                "SELECT current_database(), current_user, version()"
            )
        )

        database_name, username, version = result.fetchone()

        print("Database connection successful!")
        print(f"Database: {database_name}")
        print(f"User: {username}")
        print(f"PostgreSQL version: {version}")

except Exception as error:
    print("Database connection failed.")
    print(f"Error: {error}")

finally:
    engine.dispose()
