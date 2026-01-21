const DEFAULT_SERVICE_NAME = "bun-ipc";

type OtelAttributes = Record<string, string | number | boolean>;

const buildAttributes = (attributes: OtelAttributes) =>
  Object.entries(attributes).map(([key, value]) => ({
    key,
    value:
      typeof value === "string"
        ? { stringValue: value }
        : typeof value === "number"
        ? { doubleValue: value }
        : { boolValue: value },
  }));

const toUnixNano = (date: Date) => `${date.getTime()}000000`;

const getEndpoint = () => {
  const base = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!base) return null;
  return base.endsWith("/") ? `${base}v1/logs` : `${base}/v1/logs`;
};

export const emitTelemetryLog = async (message: string, attributes: OtelAttributes = {}) => {
  const endpoint = getEndpoint();
  if (!endpoint) return;

  const serviceName = Bun.env.OTEL_SERVICE_NAME ?? DEFAULT_SERVICE_NAME;
  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "bun-ipc" },
            logRecords: [
              {
                timeUnixNano: toUnixNano(new Date()),
                severityText: "INFO",
                body: { stringValue: message },
                attributes: buildAttributes(attributes),
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return;
  }
};
