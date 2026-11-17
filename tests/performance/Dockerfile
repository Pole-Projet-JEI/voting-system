FROM node:22-bookworm-slim
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV EXPECTED_SOURCE_REVISION=$SOURCE_REVISION
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
EXPOSE 3000
USER node
CMD ["node", "src/index.mjs"]
