# Step 1: Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) to install dependencies first
COPY --chown=node:node package*.json ./
RUN chown node:node /app
USER node
RUN npm install

# Copy the rest of the frontend source code
COPY --chown=node:node . .

ARG VITE_API_URL=/api/
ENV VITE_API_URL=${VITE_API_URL}
# fr = French interface (vote.jeinsat.com); default English.
ARG VITE_LANG=en
ENV VITE_LANG=${VITE_LANG}

# Build the app using Vite (this assumes a Vite React project)
RUN npm run build

FROM nginx@sha256:1beed3ca46acebe9d3fb62e9067f03d05d5bfa97a00f30938a0a3580563272ad


# Prepare runtime directories for the unprivileged Nginx user
RUN mkdir -p /etc/letsencrypt /var/cache/nginx \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /etc/letsencrypt /var/cache/nginx \
    /var/run/nginx.pid /usr/share/nginx/html

# Copy the build output from the build stage to Nginx's public folder
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the custom React Router Nginx configuration to /etc/nginx/conf.d/
# Use production config (with SSL support)
COPY default.conf /etc/nginx/conf.d/default.conf

# Expose the unprivileged frontend port
EXPOSE 8080

USER nginx

# Start Nginx to serve the app
CMD ["nginx", "-g", "daemon off;"]
