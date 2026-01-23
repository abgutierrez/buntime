# Example: Net warn MySQL port
# Recommended policy set: NetEgressPolicy
# Expected: connection to localhost on port 3306 should trigger warning.

import socket
import threading
import time


def start_server(port):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", port))
    server.listen(1)
    conn, _ = server.accept()
    conn.close()
    server.close()


print("[Example] Expected: MySQL port connection warning")
server_thread = threading.Thread(target=start_server, args=(3306,), daemon=True)
server_thread.start()
time.sleep(0.1)
try:
    sock = socket.create_connection(("127.0.0.1", 3306), timeout=2)
    print("[Executor] MySQL connection succeeded")
    sock.close()
except Exception as exc:
    print(f"[Executor] MySQL connection blocked: {exc}")
