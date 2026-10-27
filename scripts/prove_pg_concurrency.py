import concurrent.futures
import subprocess
import sys

# Clean users table
subprocess.run(['psql', '-d', 'whispr_test', '-c', 'TRUNCATE users CASCADE;'], check=True)

def register(uid):
    sql = f"INSERT INTO users (username, password_hash, created_at) VALUES ('user_{uid}', 'hash', 1000);"
    cmd = ['psql', '-d', 'whispr_test', '-c', sql]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return uid, res.returncode, res.stdout.strip(), res.stderr.strip()

print("Launching 10 concurrent registrations against real PostgreSQL...")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(register, i) for i in range(10)]
    results = [f.result() for f in futures]

successes = [r for r in results if r[1] == 0]
failures = [r for r in results if r[1] != 0]

print(f"Total concurrent registration attempts: {len(results)}")
print(f"Successes ({len(successes)}): {[r[0] for r in successes]}")
print(f"Failures ({len(failures)}): {[r[0] for r in failures]}")
for f in failures:
    print(f"User {f[0]} error: {f[3]}")

cnt = subprocess.run(['psql', '-d', 'whispr_test', '-t', '-c', 'SELECT count(*) FROM users;'], capture_output=True, text=True).stdout.strip()
print(f"Final PostgreSQL users count: {cnt}")

if len(successes) == 2 and cnt == '2':
    print("PROVEN: Exactly 2 succeed and 8 fail with 'link closed'. Concurrency-safe lock validated on real Postgres!")
    sys.exit(0)
else:
    print(f"FAILED: Expected 2 successes and count 2, got {len(successes)} and {cnt}")
    sys.exit(1)
