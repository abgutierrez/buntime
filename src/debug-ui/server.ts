import { join } from "path";
import indexHtml from "./index.html";
import { exampleCatalog } from "./exampleCatalog";
import type { Supervisor, SupervisorEvent } from "../supervisor/supervisor";

export interface DebugUiOptions {
  port?: number;
  examplesDir?: string;
}

export function startDebugUi(supervisor: Supervisor, options: DebugUiOptions = {}) {
  const sockets = new Set<any>();
  const examplesDir = options.examplesDir || join(process.cwd(), "example");
  const port = options.port || Number(process.env.PORT) || 3000;

  const broadcast = (msg: SupervisorEvent) => {
    const json = JSON.stringify(msg);
    for (const ws of sockets) {
      ws.send(json);
    }
  };

  supervisor.onEvent((event) => {
    broadcast(event);
  });

  const server = Bun.serve({
    port,
    reusePort: true,
    routes: {
      "/": indexHtml,
    },
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws" && server.upgrade(req)) {
        return;
      }
      if (url.pathname === "/examples") {
        return new Response(JSON.stringify(exampleCatalog), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname.startsWith("/examples/")) {
        const id = decodeURIComponent(url.pathname.replace("/examples/", ""));
        const entry = exampleCatalog.find((example) => example.id === id);
        if (!entry) {
          return new Response("Not found", { status: 404 });
        }
        const filePath = join(examplesDir, entry.file);
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(file, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
        const snapshot = supervisor.getSnapshot();
        ws.send(JSON.stringify({ type: "policy-loaded", data: snapshot.policy }));
        if (snapshot.policyMeta) {
          ws.send(
            JSON.stringify({
              type: "policy-set-loaded",
              data: snapshot.policyMeta,
            }),
          );
        }
        ws.send(JSON.stringify({ type: "state", data: { bun: "Ready" } }));
      },
      async message(ws, message) {
        const msgStr =
          typeof message === "string"
            ? message
            : new TextDecoder().decode(message);

        if (msgStr === "STOP") {
          supervisor.interrupt();
          return;
        }

        let payload: any = null;
        try {
          payload = JSON.parse(msgStr);
        } catch {}

        if (payload?.type === "apply-policy") {
          try {
            await supervisor.applyPolicySet(payload, "apply");
            ws.send(
              JSON.stringify({
                type: "state",
                data: { bun: "Policy Applied" },
              }),
            );
          } catch (error: any) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: `Policy apply failed: ${error.message}`,
              }),
            );
          }
          return;
        }

        const code = payload?.type === "run" ? payload.code : msgStr;
        if (payload?.type === "run" && (payload.policies || payload.policy)) {
          try {
            await supervisor.applyPolicySet(payload, "run");
          } catch (error: any) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: `Policy apply failed: ${error.message}`,
              }),
            );
            return;
          }
        }

        supervisor.sendCode(code || "");
      },
      close(ws) {
        sockets.delete(ws);
      },
    },
  });

  console.log(`[DebugUI] Listening on http://localhost:${port}`);
  return server;
}
