const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3080",
];

const normalizeOrigins = (rawOrigins) => {
  const origins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error("CORS_ORIGINS must contain at least one origin");
  }

  return origins.map((origin) => {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }

    if (
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin.replace(/\/$/, "")
    ) {
      throw new Error(`CORS origin must be an HTTP(S) origin: ${origin}`);
    }

    return parsedOrigin.origin;
  });
};

export const getAllowedOrigins = ({
  nodeEnv = process.env.NODE_ENV || "development",
  rawOrigins = process.env.CORS_ORIGINS,
} = {}) => {
  if (!rawOrigins && nodeEnv === "production") {
    throw new Error("CORS_ORIGINS must be configured in production");
  }

  return normalizeOrigins(
    rawOrigins || LOCAL_DEVELOPMENT_ORIGINS.join(",")
  );
};

export const createCorsOptions = (configuration) => {
  const allowedOrigins = new Set(getAllowedOrigins(configuration));

  return {
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        return callback(null, false);
      }

      return callback(null, allowedOrigins.has(requestOrigin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  };
};
