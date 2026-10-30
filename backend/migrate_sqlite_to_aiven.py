
import os
from dotenv import load_dotenv
from sqlalchemy import (
    create_engine, MetaData, select, inspect, text
)
from sqlalchemy.engine import URL

print("EVENTSYNC MIGRATION STARTED", flush=True)

# 1. Load environment variables
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

# 2. SQLite source
SQLITE_PATH = os.path.join(BASE_DIR, "eventsync.db")
if not os.path.exists(SQLITE_PATH):
    raise FileNotFoundError(SQLITE_PATH)

sqlite_engine = create_engine(f"sqlite:///{SQLITE_PATH}")

# 3. Aiven destination
required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"]
missing = [key for key in required if not os.getenv(key)]

if missing:
    raise RuntimeError(f"Missing environment variables: {missing}")

aiven_url = URL.create(
    "mysql+pymysql",
    username=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT")),
    database=os.getenv("DB_NAME"),
)

mysql_engine = create_engine(
    aiven_url,
    pool_pre_ping=True,
    connect_args={"ssl": {}}
)

# 4. Confirm destination is empty
print("Checking Aiven database...", flush=True)

with mysql_engine.connect() as conn:
    existing_tables = inspect(mysql_engine).get_table_names()
    print("Existing Aiven tables:", existing_tables, flush=True)

    if existing_tables:
        raise RuntimeError(
            "Aiven is not empty. Migration stopped to prevent conflicts."
        )

# 5. Read SQLite schema
metadata = MetaData()
metadata.reflect(bind=sqlite_engine)
tables = metadata.sorted_tables

print(f"Found {len(tables)} SQLite tables.", flush=True)

# 6. Create tables in Aiven
print("Creating MySQL tables...", flush=True)

metadata.create_all(mysql_engine)

# 7. Copy records in foreign-key dependency order
print("Starting data transfer...", flush=True)

with sqlite_engine.connect() as source:
    with mysql_engine.begin() as destination:

        for table in tables:
            rows = source.execute(
                select(table)
            ).mappings().all()

            print(
                f"Transferring {table.name}: {len(rows)} records",
                flush=True
            )

            if rows:
                destination.execute(
                    table.insert(),
                    [dict(row) for row in rows]
                )

# 8. Verify all record counts
print("\nVERIFYING MIGRATION...", flush=True)

all_passed = True

with sqlite_engine.connect() as source:
    with mysql_engine.connect() as destination:

        for table in tables:
            source_count = source.execute(
                select(text("COUNT(*)")).select_from(table)
            ).scalar_one()

            destination_count = destination.execute(
                select(text("COUNT(*)")).select_from(
                    metadata.tables[table.name]
                )
            ).scalar_one()

            passed = source_count == destination_count
            all_passed = all_passed and passed

            print(
                f"{table.name}: "
                f"SQLite={source_count}, "
                f"Aiven={destination_count}, "
                f"{'PASS' if passed else 'FAIL'}",
                flush=True
            )

print("\n" + "=" * 45)

if all_passed:
    print("MIGRATION VERIFICATION PASSED", flush=True)
    print("ALL RECORDS TRANSFERRED SUCCESSFULLY", flush=True)
else:
    print("MIGRATION VERIFICATION FAILED", flush=True)

print("=" * 45)

sqlite_engine.dispose()
mysql_engine.dispose()
